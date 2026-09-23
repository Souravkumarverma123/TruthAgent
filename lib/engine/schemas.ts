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

/** Structured output of the Understand step (one call, luna). */
export const UnderstandSchema = z.object({
  main_claim: z.object({
    /** The claim as written in the Message. */
    original: z.string(),
    /** A canonical English sentence, for searching and caching. */
    canonical_en: z.string(),
  }),
});
export type Understood = z.infer<typeof UnderstandSchema>;

/** A quoted, linked piece of Evidence the model found via hosted web search. */
export const EvidenceSchema = z.object({
  url: z.string(),
  site: z.string(),
  quote: z.string(),
  stance: z.enum(["supports", "contradicts", "irrelevant"]),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** Structured output of the Verdict step (one call, luna, with hosted web search). */
export const VerdictSchema = z.object({
  label: z.enum(VERDICT_LABELS),
  one_line: z.string(),
  evidence: z.array(EvidenceSchema),
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
}

/** Step events streamed from the Check endpoint. Covers only the events this
 * ticket needs; `cache`, `step`, `evidence` are added by issues #4, #5, #12. */
export type CheckEvent =
  | { type: "understood"; claim: { original: string; canonicalEn: string } }
  | { type: "verdict"; label: VerdictLabel; oneLine: string }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
