import { z } from "zod";

/** "Text over 2,000 characters is rejected" (issue #3 acceptance criteria).
 * Lives here, not in check.ts, so the client-side input page (app/page.tsx)
 * can import it without pulling check.ts's server-only deps (fs, OpenAI,
 * Redis) into the browser bundle. */
export const MAX_MESSAGE_LENGTH = 2000;

/** One photo per Message, as sent (the input page resizes it to about 1600px first). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const NOT_AN_IMAGE = "That file isn't a photo we can read — please add a PNG, JPEG or WEBP image.";
export const PHOTO_TOO_BIG = "That photo is over 5 MB — please add a smaller one.";

/** CONTEXT.md: True, False, Misleading, Outdated, Not confirmed yet. */
export const VERDICT_LABELS = ["true", "false", "misleading", "outdated", "unconfirmed"] as const;
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
  /** Text read from the photo or screenshot; null with no photo or no text in it. */
  image_text: z.string().nullable(),
  /** What the photo shows, in a sentence; null with no photo. */
  image_description: z.string().nullable(),
  /** Null when there's nothing to check, e.g. a photo with no text anywhere. */
  main_claim: z
    .object({
      /** The claim as written in the Message. */
      original: z.string(),
      /** A canonical English sentence, for searching and caching. */
      canonical_en: z.string(),
      claim_type: z.enum(CLAIM_TYPES),
    })
    .nullable(),
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

/** One agent model turn, reduced to what the loop needs (agent.ts). Replay Scenarios hold these. */
export interface AgentTurn {
  responseId: string;
  /** Hosted web searches the model ran during this turn. */
  searches: { query: string; failed: boolean }[];
  /** Our function tools the model wants run. */
  calls: { callId: string; name: string; arguments: string }[];
  /** Set once the model stops calling tools. */
  evidence: EvidenceCandidate[] | null;
}

/** Structured output of Origin tagging (one luna call over all accepted Evidence): Evidence grouped
 * by Origin, so one wire story is one group whatever it's called. */
export const OriginsSchema = z.object({
  origins: z.array(z.object({ origin: z.string(), evidence_ids: z.array(z.string()) })),
});
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
  /** Published by a fact-checking organisation: a lead, so never an Independent
   * source (CONTEXT.md "Fact-check"). Its own box is issue #6. */
  factCheck: boolean;
}

export const REASONING_TAGS = ["fact", "inference", "assumption", "hypothesis"] as const;

/** Structured output of the Verdict step (luna twice, sol once for a Hard claim). Evidence is cited
 * by id only; code drops a step citing an id the Check never found. */
export const VerdictSchema = z.object({
  label: z.enum(VERDICT_LABELS),
  one_line: z.string(),
  reasoning: z.array(z.object({ tag: z.enum(REASONING_TAGS), text: z.string(), evidence_ids: z.array(z.string()) })),
  /** Top-k labels with probabilities; the chosen label's is how sure the model is. */
  alternatives: z.array(z.object({ label: z.enum(VERDICT_LABELS), probability: z.number().min(0).max(1) })),
  what_would_change: z.string(),
});
export type VerdictOutput = z.infer<typeof VerdictSchema>;

/** How strongly the Evidence backs a Verdict, worked out by code (confidence.ts). */
export interface Confidence {
  level: "high" | "medium" | "low";
  reason: string;
}

/** One reasoning step on the proof page. */
export interface ReasoningStep {
  tag: (typeof REASONING_TAGS)[number];
  text: string;
  evidenceIds: string[];
}

/** What the photo file says about itself, read on the phone before the photo is resized (resizing
 * drops it). Supporting clues only: most apps strip it, so its absence proves nothing. */
export const ExifSchema = z.object({
  /** When the photo was taken, as the camera wrote it (local time, no zone). */
  taken: z.string().max(40).nullable(),
  camera: z.string().max(100).nullable(),
  place: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullable(),
});
export type Exif = z.infer<typeof ExifSchema>;

/** The photo in a Message. */
export interface MessageImage {
  bytes: Uint8Array;
  exif?: Exif | null;
}

/** A page where reverse image search found the same photo. */
export interface ImageMatch {
  url: string;
  title: string;
  source: string;
}

/** CONTEXT.md "Photo check": is the photo real, and where and when did it first appear? Decided by
 * code, separately from the Verdict, and never a bare "fake". */
export interface PhotoCheck {
  real: "yes" | "no" | "unknown";
  /** Why, in words. */
  reason: string;
  /** Earliest dated copy we found; "we found", never "the original". */
  earliest: { url: string; site: string; date: string } | null;
  /** Pages found carrying the same photo; null when the search didn't work. */
  matches: number | null;
  exif: Exif | null;
  /** What the photo shows, from Understand. */
  description: string | null;
}

/** A saved Check outcome, rendered by the proof page. docs/architecture.md §"Result shape". */
export interface Result {
  id: string;
  createdAt: string;
  /** The day the Claim was judged as of (YYYY-MM-DD). Missing on Results saved before issue #9. */
  claimDate?: string;
  message: { text: string; imageText: string | null };
  /** Null when the Message has nothing to check (a photo with no text): only the Photo check. */
  mainClaim: { original: string; canonicalEn: string } | null;
  /** Null when there's no Claim to judge. */
  verdict: Verdict | null;
  /** Only for a Message with a photo. */
  photoCheck: PhotoCheck | null;
  evidence: Evidence[];
  /** The Photo check's and the agent's steps as the user last saw them live. */
  steps: AgentStep[];
}

/** Why a Claim was Hard (CONTEXT.md "Hard claim"): the two luna Verdicts disagreed, one was under 70%
 * sure, or Independent sources disagree. */
export type HardClaimTrigger = "luna_disagreed" | "unsure" | "sources_disagree";

/** The Main claim's Verdict, as saved. */
export interface Verdict {
  label: VerdictLabel;
  oneLine: string;
  reasoning: ReasoningStep[];
  whatWouldChange: string;
  /** The model that decided it; null when code decided (no Independent source either way). */
  model: string | null;
  /** The Hard-claim trigger that fired, so sol decided; null for an easy claim. */
  trigger: HardClaimTrigger | null;
  /** Worked out by code from the Evidence (confidence.ts). */
  confidence: Confidence;
}

/** One tool call, as a line in the live step list and on the proof page. */
export interface AgentStep {
  tool: "web_search" | "read_page" | "reverse_image";
  /** Plain language, e.g. "Reading ndtv.com…". */
  line: string;
  status: "running" | "done" | "failed";
}

/** Step events streamed from the Check endpoint. */
export type CheckEvent =
  /** `claim` is null when there's nothing to check, e.g. a photo with no text. */
  | { type: "understood"; claim: { original: string; canonicalEn: string } | null }
  | ({ type: "step"; id: string } & AgentStep)
  | { type: "evidence"; id: string; site: string; stance: Evidence["stance"] }
  /** `escalated`: a Hard claim, so sol decided. */
  | { type: "verdict"; label: VerdictLabel; oneLine: string; escalated: boolean }
  /** A saved Result answers this Message: the same Message (`exact`) or the same Claim (`claim`). `done` follows. */
  | { type: "cache"; hit: "exact" | "claim"; id: string }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
