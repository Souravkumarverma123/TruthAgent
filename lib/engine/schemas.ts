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

/** A quoted, linked Evidence candidate the agent loop found. Code decides whether it's kept (evidence.ts). */
export const EvidenceCandidateSchema = z.object({
  url: z.string(),
  quote: z.string(),
  stance: z.enum(["supports", "contradicts", "irrelevant"]),
});
export type EvidenceCandidate = z.infer<typeof EvidenceCandidateSchema>;

/** Structured output the agent loop ends with: its Evidence candidates. */
export const EvidenceCandidatesSchema = z.object({ evidence: z.array(EvidenceCandidateSchema) });

/** Structured output of Origin tagging (one luna call over all accepted Evidence). */
export const OriginsSchema = z.object({ origins: z.array(z.object({ id: z.string(), origin: z.string() })) });
export type OriginsOutput = z.infer<typeof OriginsSchema>;

/** 1 official or primary, 2 fact-checker or major outlet, 3 other (sources.ts). */
export type Tier = 1 | 2 | 3;

/** Accepted Evidence: passed the block list and the quote check. Shown in the For or Against column. */
export interface Evidence {
  /** E1…En, what the Verdict cites. */
  id: string;
  url: string;
  /** The page's hostname, from the url (not the model's say-so). */
  site: string;
  tier: Tier;
  /** Published day (YYYY-MM-DD), from the page else its earliest Wayback copy. */
  date: string | null;
  quote: string;
  /** False when the page couldn't be fetched to check the quote; weighted less. */
  quoteVerified: boolean;
  stance: "supports" | "contradicts";
  /** Where the information first comes from, e.g. "ANI wire"; null if untagged. */
  origin: string | null;
}

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
  /** Distinct Origins among the Evidence (CONTEXT.md "Independent source"). */
  independentSources: number;
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

/** Step events streamed from the Check endpoint. `cache` is added by issue #12. */
export type CheckEvent =
  | { type: "understood"; claim: { original: string; canonicalEn: string } }
  | ({ type: "step"; id: string } & AgentStep)
  | { type: "evidence"; id: string; site: string; stance: Evidence["stance"] }
  | { type: "verdict"; label: VerdictLabel; oneLine: string }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
