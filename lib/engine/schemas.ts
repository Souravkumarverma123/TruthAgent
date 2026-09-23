import { z } from "zod";

/** "Text over 2,000 characters is rejected" (issue #3 acceptance criteria).
 * Lives here, not in check.ts, so the client-side input page (app/page.tsx)
 * can import it without pulling check.ts's server-only deps (fs, OpenAI,
 * Redis) into the browser bundle. */
export const MAX_MESSAGE_LENGTH = 2000;

/** CONTEXT.md: True, False, Misleading, Outdated, Not confirmed yet.
 * Outdated needs Claim date handling (issue #9) and isn't produced yet. */
export const VERDICT_LABELS = ["true", "false", "misleading", "unconfirmed"] as const;
export type VerdictLabel = (typeof VERDICT_LABELS)[number];

/** Drives the Authority rule in the agent's prompt (sources.ts). */
export const CLAIM_TYPES = [
  "death_health",
  "govt_scheme_law",
  "money_banking",
  "election",
  "disaster_weather",
  "statistics",
  "science_health",
  "image_context",
  "other",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

/** Structured output of the Understand step (one call, luna). */
export const UnderstandSchema = z.object({
  main_claim: z.object({
    /** The claim as written in the Message. */
    original: z.string(),
    /** A canonical English sentence, for searching and caching. */
    canonical_en: z.string(),
    claim_type: z.enum(CLAIM_TYPES),
  }),
});
export type Understood = z.infer<typeof UnderstandSchema>;

/** A quoted, linked piece of Evidence the agent loop found. */
export const EvidenceSchema = z.object({
  url: z.string(),
  site: z.string(),
  quote: z.string(),
  stance: z.enum(["supports", "contradicts", "irrelevant"]),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** Structured output the agent loop ends with: its Evidence candidates. */
export const EvidenceCandidatesSchema = z.object({ evidence: z.array(EvidenceSchema) });

/** Structured output of the Verdict step (one call, luna, over the agent's Evidence). */
export const VerdictSchema = z.object({
  label: z.enum(VERDICT_LABELS),
  one_line: z.string(),
});
export type VerdictOutput = z.infer<typeof VerdictSchema>;

/** A saved Check outcome, rendered by the proof page. docs/architecture.md §"Result shape". */
export interface Result {
  id: string;
  createdAt: string;
  model: string;
  message: { text: string };
  mainClaim: { original: string; canonicalEn: string };
  verdict: { label: VerdictLabel; oneLine: string };
  evidence: Evidence[];
  /** The agent's steps as the user last saw them live. */
  steps: AgentStep[];
}

/** One agent tool call, as a line in the live step list and on the proof page. */
export interface AgentStep {
  tool: "web_search" | "read_page";
  /** Plain language, e.g. "Reading ndtv.com…". */
  line: string;
  status: "running" | "done" | "failed";
}

/** Step events streamed from the Check endpoint. `cache` and `evidence` are
 * added by issues #12 and #5. */
export type CheckEvent =
  | { type: "understood"; claim: { original: string; canonicalEn: string } }
  | ({ type: "step"; id: string } & AgentStep)
  | { type: "verdict"; label: VerdictLabel; oneLine: string }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
