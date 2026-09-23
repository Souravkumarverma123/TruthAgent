// Replay Scenarios: whole answers from the outside world, one plain object per Check.
// Test-side data: the tests pass one to `replayWorld`, and the dev server's replay world
// uses DEMO_SCENARIOS (registered in instrumentation.ts). Engine modules never import this.
import { waybackCdxUrl, type Scenario } from "./boundary.ts";
import type { ClaimType, Understood, VerdictOutput } from "./schemas.ts";

/** No search happens in replay, so understanding just echoes what was typed. */
function understood(message: string, claimType: ClaimType): Understood {
  return { main_claim: { original: message, canonical_en: message, claim_type: claimType } };
}

/** A Verdict's alternatives: its label at `probability`, the rest Not confirmed yet. */
function sure(label: VerdictOutput["label"], probability: number): VerdictOutput["alternatives"] {
  return [
    { label, probability },
    { label: "unconfirmed", probability: Number((1 - probability).toFixed(2)) },
  ];
}

const html = (published: string | null, body: string) =>
  `<html><head>${published ? `<meta property="article:published_time" content="${published}">` : ""}</head>` +
  `<body>${body}</body></html>`;

const WIKIPEDIA = "https://en.wikipedia.org/wiki/Amitabh_Bachchan";
const WIKIPEDIA_LINE = "Amitabh Bachchan (born 11 October 1942) is an Indian actor";
/** Wikipedia's page has no date, so its date comes from Wayback. */
const WIKIPEDIA_PAGES = {
  [WIKIPEDIA]:
    "<html><head><title>Amitabh Bachchan - Wikipedia</title></head>" +
    `<body><p>${WIKIPEDIA_LINE}, film producer and television host.</p></body></html>`,
  [waybackCdxUrl(WIKIPEDIA)]: '[["timestamp"],["20040105093012"]]',
};

const ALT_NEWS = "https://www.altnews.in/tag/amitabh-bachchan-death-hoax/";
/** A hoax site that's gone down: reading it fails. */
const HOAX_SITE = "https://www.viralnewsnow.example/amitabh-bachchan-passes-away";
/** Readable page whose metadata date isn't a real day. */
const BAD_DATE_SITE = "https://www.dailyroundup.example/bachchan-rumour-debunked";
/** A url the model made up: the site answers 404. */
const INVENTED_LINK = "https://www.ndtv.com/entertainment/amitabh-bachchan-dies-8812345";
/** On the block list: never Evidence. */
const MEDIAMASS = "https://en.mediamass.net/people/amitabh-bachchan/deathhoax.html";

/**
 * The recurring Amitabh Bachchan death hoax (docs/handoff.md "Demo Claims"): one search and four
 * page reads (one dated by the page, one by Wayback, one with an unusable date, one that fails),
 * then Evidence that includes a blocked site and an invented quote. A hoax post says he died and
 * Wikipedia says he's alive, so Independent sources disagree and sol decides.
 */
export const BACHCHAN: Scenario = {
  understand: understood("Amitabh Bachchan has died, forward this to everyone", "death_health"),
  agentTurns: [
    {
      responseId: "resp_replay_0",
      searches: [{ query: "Amitabh Bachchan death news", failed: false }],
      calls: [ALT_NEWS, WIKIPEDIA, BAD_DATE_SITE, HOAX_SITE].map((url, i) => ({
        callId: `call_replay_${i}`,
        name: "read_page",
        arguments: JSON.stringify({ url }),
      })),
      evidence: null,
    },
    {
      responseId: "resp_replay_1",
      searches: [],
      calls: [],
      evidence: [
        {
          url: ALT_NEWS,
          quote: "This is not the first time such a rumour about Amitabh Bachchan’s death has gone viral.",
          stance: "contradicts",
        },
        { url: WIKIPEDIA, quote: WIKIPEDIA_LINE, stance: "contradicts" },
        { url: HOAX_SITE, quote: "Legendary actor Amitabh Bachchan passed away this morning in Mumbai", stance: "supports" },
        { url: MEDIAMASS, quote: "Amitabh Bachchan dead at 83", stance: "supports" },
        { url: BAD_DATE_SITE, quote: "Police confirmed Amitabh Bachchan is alive and well", stance: "contradicts" },
        { url: INVENTED_LINK, quote: "Amitabh Bachchan breathed his last at Lilavati Hospital", stance: "supports" },
      ],
    },
  ],
  pages: {
    // The apostrophe is written as the named reference a news page would use, not the numeric one.
    [ALT_NEWS]: html(
      "2024-03-12T10:30:00+05:30",
      "<article><p>This is not the first time such a rumour about Amitabh Bachchan&rsquo;s death has gone viral.</p></article>",
    ),
    ...WIKIPEDIA_PAGES,
    [BAD_DATE_SITE]: html("2026-13-40", "<p>Police said the message circulating on WhatsApp is a rumour.</p>"),
    [waybackCdxUrl(BAD_DATE_SITE)]: '[["timestamp"]]',
    [HOAX_SITE]: 503,
    [INVENTED_LINK]: 404,
  },
  // Kept: E1 Alt News, E2 Wikipedia, E3 the hoax post (unreadable, so unverified).
  origins: {
    origins: [
      { origin: "Alt News's own reporting", evidence_ids: ["E1"] },
      { origin: "Wikipedia's article", evidence_ids: ["E2"] },
      { origin: "viralnewsnow.example's unsourced post", evidence_ids: ["E3"] },
    ],
  },
  verdicts: (() => {
    const verdict: VerdictOutput = {
      label: "false",
      one_line: "No credible source reports this; the claim traces back to a recurring hoax, not news.",
      reasoning: [
        { tag: "fact", text: "Alt News says this death rumour has gone viral before.", evidence_ids: ["E1"] },
        { tag: "fact", text: "Wikipedia gives his birth date and no date of death.", evidence_ids: ["E2"] },
        { tag: "inference", text: "The only report of a death is an unsourced post.", evidence_ids: ["E3"] },
        // Cites an Evidence id the Check never found, so it's dropped.
        { tag: "hypothesis", text: "A hospital statement confirmed the death.", evidence_ids: ["E99"] },
        { tag: "assumption", text: "A death this famous would be reported by major outlets within hours.", evidence_ids: [] },
      ],
      alternatives: sure("false", 0.9),
      what_would_change: "A statement from his family or a major outlet reporting the death.",
    };
    return { luna: [verdict, verdict], sol: verdict };
  })(),
};

const ANI_LINE =
  "New Delhi [India], December 2 (ANI): The Reserve Bank of India on Tuesday said ₹500 notes remain legal tender " +
  "and there is no plan to withdraw them.";
const ANI_SITES = Array.from({ length: 15 }, (_, i) => `https://news${i + 1}.example/rbi-500-notes-legal-tender`);

/** One ANI line carried by 15 sites, cited from search without reading. The two luna runs disagree. */
export const RBI_500: Scenario = (() => {
  const verdict = (label: VerdictOutput["label"], probability: number): VerdictOutput => ({
    label,
    one_line: "The ANI report quotes RBI saying ₹500 notes remain legal tender.",
    reasoning: [{ tag: "fact", text: "ANI quotes RBI: ₹500 notes remain legal tender.", evidence_ids: ["E1"] }],
    alternatives: sure(label, probability),
    what_would_change: "An RBI notice withdrawing ₹500 notes.",
  });
  return {
    understand: understood("RBI is banning ₹500 notes from 1 January, forward to all", "money_banking"),
    agentTurns: [
      {
        responseId: "resp_replay_rbi",
        searches: [{ query: "RBI ₹500 notes ban", failed: false }],
        calls: [],
        evidence: ANI_SITES.map((url) => ({
          url,
          quote: "The Reserve Bank of India on Tuesday said ₹500 notes remain legal tender",
          stance: "contradicts",
        })),
      },
    ],
    pages: Object.fromEntries(
      ANI_SITES.map((url, i) => [url, html("2025-12-02", `<nav>News ${i + 1} home</nav><p>${ANI_LINE}</p>`)]),
    ),
    origins: { origins: [{ origin: "ANI wire", evidence_ids: ANI_SITES.map((_, i) => `E${i + 1}`) }] },
    verdicts: { luna: [verdict("false", 0.8), verdict("misleading", 0.8)], sol: verdict("false", 0.85) },
  };
})();

const BOOM = "https://www.boomlive.in/fact-check/free-laptop-scheme-message-is-false";
const BOOM_LINE = "There is no such free laptop scheme; the message circulating is false.";

/** The only thing found is someone else's Fact-check, a lead and never an Independent source, so
 * code says Not confirmed yet and no Verdict is asked for. */
export const LAPTOP: Scenario = {
  understand: understood("Government is giving free laptops to all students, register today", "govt_scheme_law"),
  agentTurns: [
    {
      responseId: "resp_replay_laptop",
      searches: [{ query: "free laptop scheme fact check", failed: false }],
      calls: [],
      evidence: [{ url: BOOM, quote: BOOM_LINE, stance: "contradicts" }],
    },
  ],
  pages: { [BOOM]: html("2026-01-20", `<p>${BOOM_LINE}</p>`) },
  origins: { origins: [{ origin: "BOOM's own fact-check", evidence_ids: ["E1"] }] },
};

const RBI_PRESS = "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=55707";
const RBI_PRESS_LINE = "The Reserve Bank of India has decided to withdraw the ₹2000 denomination banknotes from circulation.";
const HINDU = "https://www.thehindu.com/business/rbi-withdraws-2000-notes/article66871234.ece";
const HINDU_LINE = "RBI on Friday announced the withdrawal of ₹2,000 notes from circulation, PTI reported.";

/** An easy True claim: an RBI press release and a PTI report agree, nothing against. */
export const WITHDRAWN_2000: Scenario = (() => {
  const verdict: VerdictOutput = {
    label: "true",
    one_line: "RBI announced the withdrawal of ₹2000 notes from circulation.",
    reasoning: [{ tag: "fact", text: "RBI's press release says ₹2000 notes are being withdrawn.", evidence_ids: ["E1"] }],
    alternatives: sure("true", 0.9),
    what_would_change: "An RBI notice reversing the withdrawal.",
  };
  return {
    understand: understood("RBI has withdrawn ₹2000 notes from circulation", "money_banking"),
    agentTurns: [
      {
        responseId: "resp_replay_withdrawn",
        searches: [{ query: "RBI ₹2000 notes withdrawn", failed: false }],
        calls: [],
        evidence: [
          { url: RBI_PRESS, quote: RBI_PRESS_LINE, stance: "supports" },
          { url: HINDU, quote: HINDU_LINE, stance: "supports" },
        ],
      },
    ],
    pages: {
      [RBI_PRESS]: html("2023-05-19", `<p>${RBI_PRESS_LINE}</p>`),
      [HINDU]: html("2023-05-19", `<p>${HINDU_LINE}</p>`),
    },
    origins: {
      origins: [
        { origin: "RBI press release", evidence_ids: ["E1"] },
        { origin: "PTI wire", evidence_ids: ["E2"] },
      ],
    },
    verdicts: { luna: [verdict, verdict] },
  };
})();

/** Wikipedia alone, against the Claim: the one-sided Evidence of the two scenarios below. */
function wikipediaOnly(message: string): Scenario {
  return {
    understand: understood(message, "death_health"),
    agentTurns: [
      {
        responseId: "resp_replay_wikipedia",
        searches: [{ query: "Amitabh Bachchan news", failed: false }],
        calls: [],
        evidence: [{ url: WIKIPEDIA, quote: WIKIPEDIA_LINE, stance: "contradicts" }],
      },
    ],
    pages: WIKIPEDIA_PAGES,
    origins: { origins: [{ origin: "Wikipedia's article", evidence_ids: ["E1"] }] },
  };
}

/** A Hard claim: both luna runs are under 70% sure, and so is sol. */
export const HOSPITAL: Scenario = (() => {
  const verdict = (probability: number): VerdictOutput => ({
    label: "false",
    one_line: "Nothing found reports him in hospital.",
    reasoning: [{ tag: "inference", text: "Wikipedia says nothing of a hospital stay.", evidence_ids: ["E1"] }],
    alternatives: sure("false", probability),
    what_would_change: "A statement from the family or the hospital.",
  });
  return {
    ...wikipediaOnly("Amitabh Bachchan admitted to hospital in critical condition, pray for him"),
    verdicts: { luna: [verdict(0.6), verdict(0.6)], sol: verdict(0.55) },
  };
})();

/** A Hard claim: one luna run says it's 120% sure, not a probability, so not a confident Verdict. */
export const RETIRED: Scenario = (() => {
  const verdict = (alternatives: VerdictOutput["alternatives"]): VerdictOutput => ({
    label: "false",
    one_line: "Nothing found reports him retiring.",
    reasoning: [{ tag: "inference", text: "Wikipedia says nothing of him retiring.", evidence_ids: ["E1"] }],
    alternatives,
    what_would_change: "A statement from him or his family.",
  });
  return {
    ...wikipediaOnly("Amitabh Bachchan has retired from films, forward this"),
    verdicts: {
      luna: [verdict(sure("false", 0.9)), verdict([{ label: "false", probability: 1.2 }])],
      sol: verdict(sure("false", 0.9)),
    },
  };
})();

/** A plain forward the agent finds nothing on. */
export const SOME_FORWARD: Scenario = {
  understand: understood("Some forward", "other"),
  agentTurns: [{ responseId: "resp_replay_nothing", searches: [], calls: [], evidence: [] }],
};

/** The dev server's replay answers, by the Message typed. */
export const DEMO_SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  [BACHCHAN, RBI_500, LAPTOP, WITHDRAWN_2000, HOSPITAL, RETIRED, SOME_FORWARD].map((s) => [
    s.understand!.main_claim.original,
    s,
  ]),
);
