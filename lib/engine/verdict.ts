// The Verdict for one Claim, given its Evidence (docs/architecture.md §5 ⑦): every rule for deciding
// it lives here, so check() only orders the steps. Code decides Not confirmed yet when nothing
// independent backs either side; otherwise luna ×2, and sol once for a Hard claim.
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { World } from "./boundary.ts";
import { confidenceOf, independentSources, originsBySide } from "./confidence.ts";
import { MODELS } from "./models.ts";
import { VerdictSchema, type Evidence, type HardClaimTrigger, type Verdict, type VerdictOutput } from "./schemas.ts";

/** Below this, a Verdict's top label isn't sure enough: a Hard claim (CONTEXT.md). */
const HARD_PROBABILITY = 0.7;

/** Our labels, as the Verdict prompt defines them. Internally they map to AVeriTeC's (docs/architecture.md
 * §5 ⑦): true = Supported, false = Refuted, misleading = Conflicting Evidence/Cherrypicking,
 * outdated = Refuted as of the Claim date but Supported earlier, unconfirmed = Not Enough Evidence. Kept out of the prompt so the AVeriTeC wording can't pull the model. */
const LABEL_DEFINITIONS =
  "true: the Evidence backs the core of the Claim. " +
  "false: the core of the Claim was never true. " +
  "misleading: the facts are right but the framing or conclusion is wrong. " +
  "outdated: the Claim was true at an earlier date and isn't as of the Claim date. " +
  "unconfirmed: too few Independent sources either way; never guess.";

async function liveVerdict(
  client: OpenAI,
  model: keyof typeof MODELS,
  claim: string,
  claimDate: string,
  evidence: Evidence[],
  independentSources: number,
): Promise<VerdictOutput> {
  const response = await client.responses.parse({
    model: MODELS[model],
    instructions:
      `Today's date is ${new Date().toISOString().slice(0, 10)}. Judge the Claim as of ${claimDate}, ` +
      `using only the Evidence given. Labels: ${LABEL_DEFINITIONS} ` +
      "Mind each item's date: something first reported after the Claim date most likely hadn't happened yet as of it. " +
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

/** Which Hard-claim trigger fired, the first in this order, or null for an easy claim. */
function hardClaimTrigger(first: VerdictOutput, second: VerdictOutput, evidence: Evidence[]): HardClaimTrigger | null {
  if (first.label !== second.label) return "luna_disagreed";
  if (Math.min(topProbability(first), topProbability(second)) < HARD_PROBABILITY) return "unsure";
  const sides = originsBySide(evidence);
  if (sides.supports.size > 0 && sides.contradicts.size > 0) return "sources_disagree";
  return null;
}

/** The Verdict for a Claim as of its Claim date. No Origin for or against it means nothing independent
 * backs it, whether the Evidence is only Fact-checks or Origin tagging failed: code says Not confirmed
 * yet and no model is paid for (CONTEXT.md "Not confirmed yet"). Otherwise luna judges twice in
 * parallel; a Hard claim gets one sol Verdict, and if sol isn't sure either it's Not confirmed yet. sol
 * is used nowhere else. Reasoning citing an Evidence id the Check never found is dropped. */
export async function judge(claim: string, claimDate: string, evidence: Evidence[], world: World): Promise<Verdict> {
  const total = independentSources(evidence);
  if (total === 0) {
    return {
      label: "unconfirmed",
      oneLine: "No independent source has confirmed or denied this yet.",
      reasoning: [],
      whatWouldChange: "An Independent source confirming or denying it.",
      model: null,
      trigger: null,
      confidence: confidenceOf("unconfirmed", 0, evidence),
    };
  }

  const run = (model: keyof typeof MODELS, index: number) =>
    world.openai({ step: "verdict", model, run: index }, (client) =>
      liveVerdict(client, model, claim, claimDate, evidence, total),
    );
  const [first, second] = await Promise.all([run("luna", 0), run("luna", 1)]);
  const trigger = hardClaimTrigger(first, second, evidence);
  const decided = trigger ? await run("sol", 0) : first;
  const model = trigger ? MODELS.sol : MODELS.luna;

  // sol's reasoning argues for a label it wasn't sure of, so it doesn't explain Not confirmed yet.
  if (trigger && topProbability(decided) < HARD_PROBABILITY) {
    return {
      label: "unconfirmed",
      oneLine: "Two quick verdicts and a second opinion couldn't settle this, so it isn't confirmed yet.",
      reasoning: [],
      whatWouldChange: "More Independent sources agreeing one way.",
      model,
      trigger,
      confidence: confidenceOf("unconfirmed", 0, evidence),
    };
  }
  const ids = new Set(evidence.map((e) => e.id));
  return {
    label: decided.label,
    oneLine: decided.one_line,
    reasoning: decided.reasoning
      .filter((step) => step.evidence_ids.every((id) => ids.has(id)))
      .map((step) => ({ tag: step.tag, text: step.text, evidenceIds: step.evidence_ids })),
    whatWouldChange: decided.what_would_change,
    model,
    trigger,
    confidence: confidenceOf(decided.label, topProbability(decided), evidence),
  };
}
