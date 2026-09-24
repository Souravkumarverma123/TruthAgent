// Scoring for the accuracy run (#15): pure, so it can be checked without spending a cent.
import { VERDICT_LABELS, type VerdictLabel } from "../engine/schemas.ts";

/** One known-answer Claim (claims.json). */
export interface AccuracyClaim {
  id: string;
  claim: string;
  /** Judge as of this day (YYYY-MM-DD); today when absent. */
  claimDate?: string;
  expected: VerdictLabel;
  /** Where the expected answer comes from. */
  source: { publisher: string; rating: string; url: string };
  note?: string;
  /** Chosen for the demo (a Misleading and an Outdated one are still needed, spec "Demo Claims"). */
  demo?: boolean;
}

/** What a live Check gave: a Verdict label, or "error" when the Check produced none. */
export interface Outcome {
  claim: AccuracyClaim;
  got: VerdictLabel | "error";
  /** A Hard claim: sol decided. */
  escalated: boolean;
}

export interface Summary {
  right: number;
  total: number;
  /** Per expected label. */
  byLabel: Partial<Record<VerdictLabel, { right: number; total: number }>>;
  /** Share of the Checks that got a Verdict which were escalated to sol. */
  escalationRate: number;
}

export function summarize(outcomes: Outcome[]): Summary {
  const byLabel: Summary["byLabel"] = {};
  for (const label of VERDICT_LABELS) {
    const of = outcomes.filter((o) => o.claim.expected === label);
    if (of.length) byLabel[label] = { right: of.filter((o) => o.got === label).length, total: of.length };
  }
  const judged = outcomes.filter((o) => o.got !== "error");
  return {
    right: outcomes.filter((o) => o.got === o.claim.expected).length,
    total: outcomes.length,
    byLabel,
    escalationRate: judged.length ? judged.filter((o) => o.escalated).length / judged.length : 0,
  };
}
