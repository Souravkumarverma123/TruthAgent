// Replay-mode fixtures for the outside-world boundary. See boundary.ts's
// `callOpenAI` doc comment for why these are static rather than hash-keyed.
import type { AgentTurn } from "./agent.ts";
import { waybackCdxUrl } from "./boundary.ts";
import type { Understood, VerdictOutput } from "./schemas.ts";

/** No search happens in replay mode, so this just echoes what was typed —
 * that's the one part of "understanding" that costs nothing to get right. */
export function understandFixture(message: string): Understood {
  const original = message.trim();
  return { main_claim: { original, canonical_en: original, claim_type: "death_health" } };
}

const ALT_NEWS = "https://www.altnews.in/tag/amitabh-bachchan-death-hoax/";
const WIKIPEDIA = "https://en.wikipedia.org/wiki/Amitabh_Bachchan";
/** Not recorded below, so reading it fails, like a hoax site that's gone down. */
const HOAX_SITE = "https://www.viralnewsnow.example/amitabh-bachchan-passes-away";

/**
 * The agent's turns in the fixed demo scenario (the recurring Amitabh
 * Bachchan death hoax, see docs/handoff.md "Demo Claims"): one search and
 * three page reads (one dated by the page, one by Wayback, one that fails),
 * then the Evidence.
 */
export function agentTurnFixture(turnIndex: number): AgentTurn {
  if (turnIndex === 0) {
    return {
      responseId: "resp_replay_0",
      searches: [{ query: "Amitabh Bachchan death news", failed: false }],
      calls: [ALT_NEWS, WIKIPEDIA, HOAX_SITE].map((url, i) => ({
        callId: `call_replay_${i}`,
        name: "read_page",
        arguments: JSON.stringify({ url }),
      })),
      evidence: null,
    };
  }
  return {
    responseId: "resp_replay_1",
    searches: [],
    calls: [],
    evidence: [
      {
        url: ALT_NEWS,
        site: "Alt News",
        quote: "This is not the first time such a rumour about Amitabh Bachchan's death has gone viral.",
        stance: "contradicts",
      },
      {
        url: WIKIPEDIA,
        site: "Wikipedia",
        quote: "Amitabh Bachchan (born 11 October 1942) is an Indian actor",
        stance: "contradicts",
      },
    ],
  };
}

/** Recorded bodies, keyed by the exact URL fetched (pages and Wayback CDX lookups). */
const RECORDED_PAGES: Record<string, string> = {
  [ALT_NEWS]:
    '<html><head><meta property="article:published_time" content="2024-03-12T10:30:00+05:30"></head>' +
    "<body><article><p>This is not the first time such a rumour about Amitabh Bachchan&#39;s death has gone viral.</p>" +
    "</article></body></html>",
  [WIKIPEDIA]:
    "<html><head><title>Amitabh Bachchan - Wikipedia</title></head>" +
    "<body><p>Amitabh Bachchan (born 11 October 1942) is an Indian actor, film producer and television host.</p></body></html>",
  [waybackCdxUrl(WIKIPEDIA)]:
    '[["timestamp"],["20040105093012"]]',
};

export function pageFixture(url: string): string | undefined {
  return RECORDED_PAGES[url];
}

export function verdictFixture(): VerdictOutput {
  return {
    label: "false",
    one_line: "No credible source reports this; the claim traces back to a recurring hoax, not news.",
  };
}
