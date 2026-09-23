// The Engine's one entry point (AGENTS.md: "One test seam"). Understand →
// agent loop (agent.ts) → Evidence processing (evidence.ts) → Verdict (luna ×2, sol for Hard claims) → save. See docs/architecture.md §5
// for the full pipeline this tracer bullet is the first slice of.
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { agentLoop } from "./agent.ts";
import { callOpenAI, saveResult } from "./boundary.ts";
import { confidenceOf, originsBySide } from "./confidence.ts";
import { processEvidence } from "./evidence.ts";
import { understandFixture, verdictFixture } from "./fixtures.ts";
import { MODELS } from "./models.ts";
import {
  MAX_MESSAGE_LENGTH,
  UnderstandSchema,
  VerdictSchema,
  type CheckEvent,
  type Evidence,
  type Result,
  type Understood,
  type VerdictOutput,
} from "./schemas.ts";

export interface CheckOptions {
  /** "When did you get this?" — defaults to today. Wired up by issue #9. */
  claimDate?: string;
}

async function liveUnderstand(client: OpenAI, message: string): Promise<Understood> {
  const response = await client.responses.parse({
    model: MODELS.luna,
    instructions:
      "Read the forwarded message and find the one Claim it's really about " +
      "(the Main claim). Give it back as a short original excerpt, a " +
      "canonical English sentence suitable for a web search, and its Claim type.",
    input: message,
    text: { format: zodTextFormat(UnderstandSchema, "understand") },
  });
  if (!response.output_parsed) throw new Error("Understand step returned no output");
  return response.output_parsed;
}

/** No Origin for or against the Claim means nothing independent backs it, whether the Evidence is
 * only Fact-checks or Origin tagging failed. The Verdict is then "Not confirmed yet" whatever the
 * model says (CONTEXT.md "Not confirmed yet"). */
const NOT_CONFIRMED: Result["verdict"] = {
  label: "unconfirmed",
  oneLine: "No independent source has confirmed or denied this yet.",
  reasoning: [],
  whatWouldChange: "An Independent source confirming or denying it.",
  escalated: false,
  confidence: confidenceOf("unconfirmed", 0, []),
};

/** Below this, a Verdict's top label isn't sure enough: a Hard claim (CONTEXT.md). */
const HARD_PROBABILITY = 0.7;

/** Our labels, as the Verdict prompt defines them. Internally they map to AVeriTeC's (docs/architecture.md
 * §5 ⑦): true = Supported, false = Refuted, misleading = Conflicting Evidence/Cherrypicking,
 * unconfirmed = Not Enough Evidence. Kept out of the prompt so the AVeriTeC wording can't pull the model. */
const LABEL_DEFINITIONS =
  "true: the Evidence backs the core of the Claim. " +
  "false: the core of the Claim was never true. " +
  "misleading: the facts are right but the framing or conclusion is wrong. " +
  "unconfirmed: too few Independent sources either way; never guess.";

async function liveVerdict(
  client: OpenAI,
  model: string,
  claim: string,
  claimDate: string,
  evidence: Evidence[],
  independentSources: number,
): Promise<VerdictOutput> {
  const response = await client.responses.parse({
    model,
    instructions:
      `Today's date is ${new Date().toISOString().slice(0, 10)}. Judge the Claim as of ${claimDate}, ` +
      `using only the Evidence given. Labels: ${LABEL_DEFINITIONS} ` +
      "Give a one-line plain-language reason. Evidence marked quoteVerified: false couldn't be checked " +
      "against its page; items sharing an Origin count as one Independent source, and items marked " +
      "factCheck: true repeat someone else's verdict, so they are a lead, not an Independent source. " +
      "Show your reasoning as short steps, each tagged fact (stated by the Evidence), inference (follows " +
      "from facts), assumption (taken as given, not in the Evidence) or hypothesis (a possible explanation), " +
      "citing the Evidence ids it relies on (e.g. E1); cite only ids you were given. " +
      "List your top labels with probabilities summing to 1, the chosen label included. " +
      "Say what new Evidence would change this Verdict.",
    // Ids, not urls: the Verdict cites Evidence only by id.
    input:
      `Claim: ${claim}\n\nIndependent sources: ${independentSources}\n\n` +
      `Evidence:\n${JSON.stringify(evidence, (key, value) => (key === "url" ? undefined : value))}`,
    text: { format: zodTextFormat(VerdictSchema, "verdict") },
  });
  if (!response.output_parsed) throw new Error("Verdict step returned no output");
  return response.output_parsed;
}

/** How sure a Verdict is of its own label. Alternatives that aren't a real probability set (a value
 * outside 0–1, a repeated label, the chosen label missing, a total far from 1) count as 0% sure, so
 * the Claim escalates rather than trusting a malformed answer. */
function topProbability(verdict: VerdictOutput): number {
  const { alternatives } = verdict;
  const total = alternatives.reduce((sum, a) => sum + a.probability, 0);
  const wellFormed =
    alternatives.every((a) => a.probability >= 0 && a.probability <= 1) &&
    new Set(alternatives.map((a) => a.label)).size === alternatives.length &&
    Math.abs(total - 1) <= 0.05;
  return (wellFormed && alternatives.find((a) => a.label === verdict.label)?.probability) || 0;
}

/** luna judges twice in parallel. A Hard claim (the runs disagree, either is under 70% sure, or
 * Independent sources disagree) gets one sol Verdict; if sol isn't sure either, the Claim is Not confirmed yet. sol is used
 * nowhere else. Code drops any reasoning step citing an Evidence id the Check never found. */
async function decideVerdict(
  claim: string,
  claimDate: string,
  evidence: Evidence[],
  independentSources: number,
): Promise<{ verdict: Result["verdict"]; model: string }> {
  const run = (model: string, index: number) =>
    callOpenAI({
      fixture: verdictFixture(claim, model, index),
      live: (client) => liveVerdict(client, model, claim, claimDate, evidence, independentSources),
    });
  const [first, second] = await Promise.all([run(MODELS.luna, 0), run(MODELS.luna, 1)]);
  const sides = originsBySide(evidence);
  const escalated =
    first.label !== second.label ||
    Math.min(topProbability(first), topProbability(second)) < HARD_PROBABILITY ||
    (sides.supports.size > 0 && sides.contradicts.size > 0);
  const decided = escalated ? await run(MODELS.sol, 0) : first;
  const unsettled = escalated && topProbability(decided) < HARD_PROBABILITY;

  const model = escalated ? MODELS.sol : MODELS.luna;
  // sol's reasoning argues for a label it wasn't sure of, so it doesn't explain Not confirmed yet.
  if (unsettled) {
    return {
      model,
      verdict: {
        label: "unconfirmed",
        oneLine: "Two quick verdicts and a second opinion couldn't settle this, so it isn't confirmed yet.",
        reasoning: [],
        whatWouldChange: "More Independent sources agreeing one way.",
        escalated,
        confidence: confidenceOf("unconfirmed", 0, evidence),
      },
    };
  }
  const ids = new Set(evidence.map((e) => e.id));
  return {
    model,
    verdict: {
      label: decided.label,
      oneLine: decided.one_line,
      reasoning: decided.reasoning
        .filter((step) => step.evidence_ids.every((id) => ids.has(id)))
        .map((step) => ({ tag: step.tag, text: step.text, evidenceIds: step.evidence_ids })),
      whatWouldChange: decided.what_would_change,
      escalated,
      confidence: confidenceOf(decided.label, topProbability(decided), evidence),
    },
  };
}

/**
 * Runs one Check on a Message and streams its progress, ending in a saved
 * Result. Tests go in through this function and assert only on what a user
 * could see: labels, Evidence, and these step events (AGENTS.md).
 */
export async function* check(message: string, options: CheckOptions = {}): AsyncGenerator<CheckEvent, void> {
  if (message.length > MAX_MESSAGE_LENGTH) {
    yield {
      type: "error",
      message: `That message is too long — please paste up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`,
    };
    return;
  }

  const claimDate = options.claimDate ?? new Date().toISOString().slice(0, 10);

  try {
    const understood = await callOpenAI({
      fixture: understandFixture(message),
      live: (client) => liveUnderstand(client, message),
    });
    const claim = understood.main_claim;
    yield { type: "understood", claim: { original: claim.original, canonicalEn: claim.canonical_en } };

    const { candidates, steps, pages } = yield* agentLoop(
      { canonicalEn: claim.canonical_en, claimType: claim.claim_type },
      claimDate,
    );
    const { evidence, independentSources } = yield* processEvidence(candidates, pages);

    // Decided by code when nothing independent backs either side, so no model call is spent on it.
    const { verdict, model } =
      independentSources === 0
        ? { verdict: NOT_CONFIRMED, model: null }
        : await decideVerdict(claim.canonical_en, claimDate, evidence, independentSources);
    yield { type: "verdict", label: verdict.label, oneLine: verdict.oneLine, escalated: verdict.escalated };

    const result: Result = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      model,
      message: { text: message },
      mainClaim: { original: claim.original, canonicalEn: claim.canonical_en },
      verdict,
      evidence,
      independentSources,
      steps,
    };
    await saveResult(result);
    yield { type: "done", id: result.id };
  } catch {
    yield { type: "error", message: "Something went wrong while checking this. Please try again." };
  }
}
