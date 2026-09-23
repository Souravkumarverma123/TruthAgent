// Replay-mode fixtures for the outside-world boundary. See boundary.ts's
// `callOpenAI` doc comment for why these are static rather than hash-keyed.
import type { AgentTurn } from "./agent.ts";
import { waybackCdxUrl } from "./boundary.ts";
import { MODELS } from "./models.ts";
import type { Evidence, OriginsOutput, Understood, VerdictOutput } from "./schemas.ts";

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
/** Readable page whose metadata date isn't a real day. */
const BAD_DATE_SITE = "https://www.dailyroundup.example/bachchan-rumour-debunked";
/** A url the model made up: the site answers 404. */
const INVENTED_LINK = "https://www.ndtv.com/entertainment/amitabh-bachchan-dies-8812345";
/** On the block list: never Evidence. */
const MEDIAMASS = "https://en.mediamass.net/people/amitabh-bachchan/deathhoax.html";

/** A third scenario: the only thing found is someone else's Fact-check, a lead and never an
 * Independent source, so the Claim stays Not confirmed yet. */
const LAPTOP_CLAIM = /laptop/i;
const BOOM = "https://www.boomlive.in/fact-check/free-laptop-scheme-message-is-false";
const BOOM_LINE = "There is no such free laptop scheme; the message circulating is false.";

/** A second scenario: one ANI line carried by 15 sites, cited from search without reading. */
const RBI_CLAIM = /₹500/;
const ANI_LINE =
  "New Delhi [India], December 2 (ANI): The Reserve Bank of India on Tuesday said ₹500 notes remain legal tender " +
  "and there is no plan to withdraw them.";
const ANI_SITES = Array.from({ length: 15 }, (_, i) => `https://news${i + 1}.example/rbi-500-notes-legal-tender`);

/** An easy True claim: an RBI press release and a PTI report agree, nothing against. */
const WITHDRAWN_CLAIM = /₹2000/;
const RBI_PRESS = "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=55707";
const RBI_PRESS_LINE = "The Reserve Bank of India has decided to withdraw the ₹2000 denomination banknotes from circulation.";
const HINDU = "https://www.thehindu.com/business/rbi-withdraws-2000-notes/article66871234.ece";
const HINDU_LINE = "RBI on Friday announced the withdrawal of ₹2,000 notes from circulation, PTI reported.";

/** The Hard claim scenarios: on the RBI claim the two luna runs disagree; on this one both are under
 * 70% sure, and so is sol. Their Evidence is one-sided, so only the luna triggers escalate them. */
const HOSPITAL_CLAIM = /hospital/i;
/** And on this one, one luna run's probabilities don't add up. */
const RETIRED_CLAIM = /retired/i;

/**
 * The agent's turns, by scenario. Default: the recurring Amitabh Bachchan
 * death hoax (docs/handoff.md "Demo Claims"): one search and four page reads
 * (one dated by the page, one by Wayback, one with an unusable date, one that
 * fails), then Evidence that includes a blocked site and an invented quote.
 */
export function agentTurnFixture(claim: string, turnIndex: number): AgentTurn {
  if (LAPTOP_CLAIM.test(claim)) {
    return {
      responseId: "resp_replay_laptop",
      searches: [{ query: "free laptop scheme fact check", failed: false }],
      calls: [],
      evidence: [{ url: BOOM, quote: BOOM_LINE, stance: "contradicts" }],
    };
  }
  if (RBI_CLAIM.test(claim)) {
    return {
      responseId: "resp_replay_rbi",
      searches: [{ query: "RBI ₹500 notes ban", failed: false }],
      calls: [],
      evidence: ANI_SITES.map((url) => ({
        url,
        quote: "The Reserve Bank of India on Tuesday said ₹500 notes remain legal tender",
        stance: "contradicts",
      })),
    };
  }
  if (WITHDRAWN_CLAIM.test(claim)) {
    return {
      responseId: "resp_replay_withdrawn",
      searches: [{ query: "RBI ₹2000 notes withdrawn", failed: false }],
      calls: [],
      evidence: [
        { url: RBI_PRESS, quote: RBI_PRESS_LINE, stance: "supports" },
        { url: HINDU, quote: HINDU_LINE, stance: "supports" },
      ],
    };
  }
  if (HOSPITAL_CLAIM.test(claim) || RETIRED_CLAIM.test(claim)) {
    return {
      responseId: "resp_replay_wikipedia",
      searches: [{ query: "Amitabh Bachchan news", failed: false }],
      calls: [],
      evidence: [{ url: WIKIPEDIA, quote: "Amitabh Bachchan (born 11 October 1942) is an Indian actor", stance: "contradicts" }],
    };
  }
  if (turnIndex === 0) {
    return {
      responseId: "resp_replay_0",
      searches: [{ query: "Amitabh Bachchan death news", failed: false }],
      calls: [ALT_NEWS, WIKIPEDIA, BAD_DATE_SITE, HOAX_SITE].map((url, i) => ({
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
        quote: "This is not the first time such a rumour about Amitabh Bachchan’s death has gone viral.",
        stance: "contradicts",
      },
      {
        url: WIKIPEDIA,
        quote: "Amitabh Bachchan (born 11 October 1942) is an Indian actor",
        stance: "contradicts",
      },
      {
        url: HOAX_SITE,
        quote: "Legendary actor Amitabh Bachchan passed away this morning in Mumbai",
        stance: "supports",
      },
      { url: MEDIAMASS, quote: "Amitabh Bachchan dead at 83", stance: "supports" },
      { url: BAD_DATE_SITE, quote: "Police confirmed Amitabh Bachchan is alive and well", stance: "contradicts" },
      { url: INVENTED_LINK, quote: "Amitabh Bachchan breathed his last at Lilavati Hospital", stance: "supports" },
    ],
  };
}

/** Recorded bodies, keyed by the exact URL fetched (pages and Wayback CDX lookups). A number is an HTTP error status. */
const RECORDED_PAGES: Record<string, string | number> = {
  [INVENTED_LINK]: 404,
  // The apostrophe is written as the named reference a news page would use, not the numeric one.
  [ALT_NEWS]:
    '<html><head><meta property="article:published_time" content="2024-03-12T10:30:00+05:30"></head>' +
    "<body><article><p>This is not the first time such a rumour about Amitabh Bachchan&rsquo;s death has gone viral.</p>" +
    "</article></body></html>",
  [BOOM]:
    '<html><head><meta property="article:published_time" content="2026-01-20"></head>' +
    `<body><p>${BOOM_LINE}</p></body></html>`,
  [WIKIPEDIA]:
    "<html><head><title>Amitabh Bachchan - Wikipedia</title></head>" +
    "<body><p>Amitabh Bachchan (born 11 October 1942) is an Indian actor, film producer and television host.</p></body></html>",
  [BAD_DATE_SITE]:
    '<html><head><meta property="article:published_time" content="2026-13-40"></head>' +
    "<body><p>Police said the message circulating on WhatsApp is a rumour.</p></body></html>",
  [RBI_PRESS]: `<html><head><meta property="article:published_time" content="2023-05-19"></head><body><p>${RBI_PRESS_LINE}</p></body></html>`,
  [HINDU]: `<html><head><meta property="article:published_time" content="2023-05-19"></head><body><p>${HINDU_LINE}</p></body></html>`,
  [waybackCdxUrl(WIKIPEDIA)]:
    '[["timestamp"],["20040105093012"]]',
  ...Object.fromEntries(
    ANI_SITES.map((url, i) => [
      url,
      '<html><head><meta property="article:published_time" content="2025-12-02"></head>' +
        `<body><nav>News ${i + 1} home</nav><p>${ANI_LINE}</p></body></html>`,
    ]),
  ),
};

export function pageFixture(url: string): string | number | undefined {
  return RECORDED_PAGES[url];
}

/** What the Origin tagger answers, by url. */
const ORIGINS: Record<string, string> = {
  [ALT_NEWS]: "Alt News's own reporting",
  [BOOM]: "BOOM's own fact-check",
  [WIKIPEDIA]: "Wikipedia's article",
  [HOAX_SITE]: "viralnewsnow.example's unsourced post",
  [RBI_PRESS]: "RBI press release",
  [HINDU]: "PTI wire",
  ...Object.fromEntries(ANI_SITES.map((url) => [url, "ANI wire"])),
};

export function originFixture(evidence: Evidence[]): OriginsOutput {
  const groups = new Map<string, string[]>();
  for (const e of evidence) {
    if (ORIGINS[e.url]) groups.set(ORIGINS[e.url], [...(groups.get(ORIGINS[e.url]) ?? []), e.id]);
  }
  return { origins: [...groups].map(([origin, evidence_ids]) => ({ origin, evidence_ids })) };
}

/** What each Verdict run answers, by scenario, model and run (the two luna runs are 0 and 1). */
export function verdictFixture(claim: string, model: string, run: number): VerdictOutput {
  const sure = (label: VerdictOutput["label"], probability: number) => [
    { label, probability },
    { label: "unconfirmed" as const, probability: Number((1 - probability).toFixed(2)) },
  ];
  if (RBI_CLAIM.test(claim)) {
    const label = model === MODELS.luna && run === 1 ? "misleading" : "false";
    return {
      label,
      one_line: "The ANI report quotes RBI saying ₹500 notes remain legal tender.",
      reasoning: [{ tag: "fact", text: "ANI quotes RBI: ₹500 notes remain legal tender.", evidence_ids: ["E1"] }],
      alternatives: sure(label, model === MODELS.sol ? 0.85 : 0.8),
      what_would_change: "An RBI notice withdrawing ₹500 notes.",
    };
  }
  if (WITHDRAWN_CLAIM.test(claim)) {
    return {
      label: "true",
      one_line: "RBI announced the withdrawal of ₹2000 notes from circulation.",
      reasoning: [{ tag: "fact", text: "RBI's press release says ₹2000 notes are being withdrawn.", evidence_ids: ["E1"] }],
      alternatives: sure("true", 0.9),
      what_would_change: "An RBI notice reversing the withdrawal.",
    };
  }
  if (RETIRED_CLAIM.test(claim)) {
    // One luna run says it's 120% sure: not a probability, so not a confident Verdict.
    return {
      label: "false",
      one_line: "Nothing found reports him retiring.",
      reasoning: [{ tag: "inference", text: "Wikipedia says nothing of him retiring.", evidence_ids: ["E1"] }],
      alternatives: model === MODELS.luna && run === 1 ? [{ label: "false", probability: 1.2 }] : sure("false", 0.9),
      what_would_change: "A statement from him or his family.",
    };
  }
  if (HOSPITAL_CLAIM.test(claim)) {
    return {
      label: "false",
      one_line: "Nothing found reports him in hospital.",
      reasoning: [{ tag: "inference", text: "Wikipedia says nothing of a hospital stay.", evidence_ids: ["E1"] }],
      alternatives: sure("false", model === MODELS.sol ? 0.55 : 0.6),
      what_would_change: "A statement from the family or the hospital.",
    };
  }
  return {
    label: "false",
    one_line: "No credible source reports this; the claim traces back to a recurring hoax, not news.",
    reasoning: [
      { tag: "fact", text: "Alt News says this death rumour has gone viral before.", evidence_ids: ["E1"] },
      { tag: "fact", text: "Wikipedia gives his birth date and no date of death.", evidence_ids: ["E2"] },
      { tag: "inference", text: "The only report of a death is an unsourced post.", evidence_ids: ["E3"] },
      { tag: "hypothesis", text: "A hospital statement confirmed the death.", evidence_ids: ["E99"] },
      { tag: "assumption", text: "A death this famous would be reported by major outlets within hours.", evidence_ids: [] },
    ],
    alternatives: sure("false", 0.9),
    what_would_change: "A statement from his family or a major outlet reporting the death.",
  };
}
