// The Engine's one entry point (AGENTS.md: "One test seam"). Understand →
// agent loop (agent.ts) → Evidence processing (evidence.ts) → one luna Verdict → save. See docs/architecture.md §5
// for the full pipeline this tracer bullet is the first slice of.
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { agentLoop } from "./agent.ts";
import { callOpenAI, saveResult } from "./boundary.ts";
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

async function liveVerdict(
  client: OpenAI,
  claim: string,
  claimDate: string,
  evidence: Evidence[],
): Promise<VerdictOutput> {
  const response = await client.responses.parse({
    model: MODELS.luna,
    instructions:
      `Today's date is ${new Date().toISOString().slice(0, 10)}. Judge the Claim as of ${claimDate}, ` +
      "using only the Evidence given. Decide: true, false, misleading, or " +
      "unconfirmed (too few independent sources either way — never guess). " +
      "Give a one-line plain-language reason. Evidence marked quoteVerified: false couldn't be checked " +
      "against its page; items sharing an origin count as one source.",
    input: `Claim: ${claim}\n\nEvidence:\n${JSON.stringify(evidence)}`,
    text: { format: zodTextFormat(VerdictSchema, "verdict") },
  });
  if (!response.output_parsed) throw new Error("Verdict step returned no output");
  return response.output_parsed;
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

    const verdict = await callOpenAI({
      fixture: verdictFixture(),
      live: (client) => liveVerdict(client, claim.canonical_en, claimDate, evidence),
    });
    yield { type: "verdict", label: verdict.label, oneLine: verdict.one_line };

    const result: Result = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      model: MODELS.luna,
      message: { text: message },
      mainClaim: { original: claim.original, canonicalEn: claim.canonical_en },
      verdict: { label: verdict.label, oneLine: verdict.one_line },
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
