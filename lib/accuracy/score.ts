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
  /** Pointed the user the right way, even if not with the fact-checker's exact label (`rightWay`). */
  rightWay: number;
  total: number;
  /** Per expected label. */
  byLabel: Partial<Record<VerdictLabel, { right: number; total: number }>>;
  /** Share of the Checks that got a Verdict which were escalated to sol. */
  escalationRate: number;
}

/** True for true, and any of False, Misleading or Outdated for a Claim that isn't: each tells the user not to
 * trust the forward as it stands. Fact-checkers themselves split on False vs Misleading. Not confirmed yet and
 * errors never count: they tell the user nothing. */
function rightWay({ claim, got }: Outcome): boolean {
  if (got === "error" || got === "unconfirmed") return false;
  return (got === "true") === (claim.expected === "true");
}

export function summarize(outcomes: Outcome[]): Summary {
  const byLabel: Summary["byLabel"] = {};
  for (const label of VERDICT_LABELS) {
    const expectedHere = outcomes.filter((o) => o.claim.expected === label);
    if (expectedHere.length) {
      byLabel[label] = { right: expectedHere.filter((o) => o.got === label).length, total: expectedHere.length };
    }
  }
  const judged = outcomes.filter((o) => o.got !== "error");
  return {
    right: outcomes.filter((o) => o.got === o.claim.expected).length,
    rightWay: outcomes.filter(rightWay).length,
    total: outcomes.length,
    byLabel,
    escalationRate: judged.length ? judged.filter((o) => o.escalated).length / judged.length : 0,
  };
}
