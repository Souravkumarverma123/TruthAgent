// Replay-mode fixtures for the outside-world boundary. See boundary.ts's
// `callOpenAI` doc comment for why these are static rather than hash-keyed.
import type { Understood, VerdictOutput } from "./schemas.ts";

/** No search happens in replay mode, so this just echoes what was typed —
 * that's the one part of "understanding" that costs nothing to get right. */
export function understandFixture(message: string): Understood {
  const original = message.trim();
  return { main_claim: { original, canonical_en: original } };
}

/** A fixed demo scenario (the recurring Amitabh Bachchan death hoax, see
 * docs/handoff.md "Demo Claims"), returned for every replay Check. */
export function verdictFixture(): VerdictOutput {
  return {
    label: "false",
    one_line: "No credible source reports this; the claim traces back to a recurring hoax, not news.",
    evidence: [
      {
        url: "https://www.altnews.in/tag/amitabh-bachchan-death-hoax/",
        site: "Alt News",
        quote: "This is not the first time such a rumour about Amitabh Bachchan's death has gone viral.",
        stance: "contradicts",
      },
    ],
  };
}
