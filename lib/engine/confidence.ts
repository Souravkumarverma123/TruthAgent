// Confidence (docs/architecture.md §5 ⑧): worked out by code from the Evidence, not the model's own
// number. The weights and cut-offs are a first guess, tuned here and only here on the accuracy test set (#15).
import type { Confidence, Evidence, Tier, VerdictLabel } from "./schemas.ts";

const CONFIDENCE = {
  weights: { probability: 0.35, agreeing: 0.25, quality: 0.2, count: 0.2 },
  /** Score at or above which Confidence is High, else Medium, else Low. */
  high: 0.75,
  medium: 0.5,
  /** Source quality per tier; a quote we couldn't check on its page counts for this share of it. */
  tierQuality: { 1: 1, 2: 0.7, 3: 0.4 } satisfies Record<Tier, number>,
  unverifiedQuote: 0.5,
};

/** Evidence that is an Independent source: tagged with an Origin, and not someone else's Fact-check. */
function independent(evidence: Evidence[]) {
  return evidence.filter((e): e is Evidence & { origin: string } => e.origin !== null && !e.factCheck);
}

/** Distinct Origins on each side, and in all (CONTEXT.md "Independent source"). */
export function originsBySide(evidence: Evidence[]) {
  const on = (stance: Evidence["stance"]) =>
    new Set(independent(evidence).filter((e) => e.stance === stance).map((e) => e.origin));
  const supports = on("supports");
  const contradicts = on("contradicts");
  return { supports, contradicts, total: new Set([...supports, ...contradicts]).size };
}

/** The side whose Evidence backs the label. ponytail: Misleading counts the side that corrects the
 * framing (contradicts); give it both sides if the accuracy run says its Confidence is too low. */
const AGREEING: Record<Exclude<VerdictLabel, "unconfirmed">, Evidence["stance"]> = {
  true: "supports",
  false: "contradicts",
  misleading: "contradicts",
};

const sources = (n: number) => (n === 1 ? "1 Independent source" : `${n} Independent sources`);

/** `probability` is how sure the deciding Verdict was of its label (0 if it gave no usable number). */
export function confidenceOf(label: VerdictLabel, probability: number, evidence: Evidence[]): Confidence {
  const sides = originsBySide(evidence);
  const { total } = sides;
  if (total === 0) return { level: "low", reason: "No Independent source confirms or denies it." };
  if (label === "unconfirmed") {
    return {
      level: "low",
      reason: `Independent sources: ${sides.supports.size} for, ${sides.contradicts.size} against. Not enough to settle it.`,
    };
  }

  const stance = AGREEING[label];
  const agreeing = sides[stance].size;
  const backing = independent(evidence).filter((e) => e.stance === stance);
  // Quality per Origin (its best item), so 15 copies of one wire line weigh as one source.
  const best = new Map<string, number>();
  for (const e of backing) {
    const q = CONFIDENCE.tierQuality[e.tier] * (e.quoteVerified ? 1 : CONFIDENCE.unverifiedQuote);
    best.set(e.origin, Math.max(q, best.get(e.origin) ?? 0));
  }
  const quality = [...best.values()].reduce((sum, q) => sum + q, 0) / (best.size || 1);
  const { weights } = CONFIDENCE;
  const score =
    weights.probability * probability +
    weights.agreeing * (agreeing / total) +
    weights.quality * quality +
    weights.count * Math.min(total / 3, 1);

  const official = new Set(backing.filter((e) => e.tier === 1).map((e) => e.origin)).size;
  const agree =
    agreeing === total
      ? `${sources(total)} ${total === 1 ? "agrees" : "agree"}`
      : `${agreeing} of ${sources(total)} agree`;
  return {
    level: score >= CONFIDENCE.high ? "high" : score >= CONFIDENCE.medium ? "medium" : "low",
    reason: official > 0 ? `${agree}, ${official} of them official.` : `${agree}.`,
  };
}
