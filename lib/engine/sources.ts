// Source knowledge: plain data, seeded from docs/research/trusted-sources.md.
import type { ClaimType, Result, Tier } from "./schemas.ts";

/** A domain entry matches itself and its subdomains. */
function matches(hostname: string, domains: string[]): boolean {
  return domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/** Never Evidence: auto-generated death hoaxes and satire. Bare domains, no scheme
 * (the web_search `blocked_domains` format). */
export const BLOCKED_DOMAINS = ["mediamass.net", "fakingnews.com", "theonion.com"];

/** Major outlets whose fact-check desks published answers in the accuracy set. Blocked whole during the run:
 * web_search blocks domains, not paths. PIB Fact Check stays open: it's the Authority for government Claims. */
const FACT_CHECK_DESKS = ["thequint.com", "ptinews.com"];
/** The most domains web_search's `blocked_domains` takes. */
const MAX_BLOCKED = 20;

/** For the accuracy run (#15): also blocks every fact-checking site, so the Engine can't copy an answer.
 * ponytail: changes the list in place for the rest of the process, since the agent's web_search tool holds
 * this same array; pass the block list in CheckOptions if one process ever needs both. */
export function blockFactCheckers(): void {
  for (const domain of [...FACT_CHECKERS, ...FACT_CHECK_DESKS]) {
    if (!BLOCKED_DOMAINS.includes(domain)) BLOCKED_DOMAINS.push(domain);
  }
  if (BLOCKED_DOMAINS.length > MAX_BLOCKED) throw new Error(`web_search blocks at most ${MAX_BLOCKED} domains`);
}

export function isBlocked(hostname: string): boolean {
  return matches(hostname, BLOCKED_DOMAINS);
}

/** Tier 1: official or primary. Government suffixes cover PIB, ministries, the e-Gazette, IMD, NCS, NASA, CDC. */
const TIER_1 = [
  "gov.in",
  "nic.in",
  "gov",
  "rbi.org.in",
  "sansad.in",
  "nseindia.com",
  "bseindia.com",
  "who.int",
  "un.org",
  "reliefweb.int",
  "gdacs.org",
  "worldbank.org",
  "imf.org",
  "esa.int",
  "cochranelibrary.com",
  "crossref.org",
];

/** Fact-checking organisations: what they publish is someone else's verdict, a lead
 * (CONTEXT.md "Fact-check"). Kept at tier 2, but never an Independent source. */
export const FACT_CHECKERS = [
  "boomlive.in",
  "factly.in",
  "newschecker.in",
  "vishvasnews.com",
  "factcrescendo.com",
  "newsmobile.in",
  "newsmeter.in",
  "altnews.in",
  "snopes.com",
  "politifact.com",
  "fullfact.org",
  "factcheck.afp.com",
  "factchecker.in",
  "digiteye.in",
];

export function isFactChecker(hostname: string): boolean {
  return matches(hostname, FACT_CHECKERS);
}

/** Tier 2: fact-checkers and major outlets, incl. the news agencies. Wikipedia is left at tier 3:
 * it can be edited during a rumour (trusted-sources.md §8). */
const TIER_2 = [
  ...FACT_CHECKERS,
  // News agencies and major outlets
  "prsindia.org",
  "reuters.com",
  "apnews.com",
  "afp.com",
  "aninews.in",
  "ptinews.com",
  "indiatoday.in",
  "thequint.com",
  "thelallantop.com",
  "thehindu.com",
  "indianexpress.com",
  "hindustantimes.com",
  "ndtv.com",
  "timesofindia.indiatimes.com",
  "economictimes.indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "theprint.in",
  "scroll.in",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "nytimes.com",
  "britannica.com",
];

export function tierOf(hostname: string): Tier {
  if (matches(hostname, TIER_1)) return 1;
  if (matches(hostname, TIER_2)) return 2;
  return 3;
}

/** Who owns the fact, per Claim type (CONTEXT.md "Authority"). Goes into the agent's prompt as text. */
export const AUTHORITY_RULES: Record<ClaimType, string> = {
  death_health:
    "Only the person's family, their own verified accounts, or the treating hospital can confirm a death or illness. " +
    "A politician's post, a TV ticker, or reports quoting unnamed 'sources' are not enough.",
  govt_scheme_law:
    "PIB (pib.gov.in), the ministry's own site, or the e-Gazette settle it. A rule not on PIB or gazetted is not in force; " +
    "PIB Fact Check and MyScheme show whether a scheme is real.",
  money_banking: "RBI (rbi.org.in), SEBI, or the bank's or company's own notice settle it.",
  election: "The Election Commission of India (eci.gov.in) settles results and election rules.",
  disaster_weather: "IMD, NDMA, NCS (seismo.gov.in) or USGS settle it.",
  statistics: "The official statistics body settles it: MoSPI, NCRB, RBI data, the Census, or the World Bank.",
  science_health:
    "WHO, MoHFW, ICMR, or peer-reviewed research settle it. A single study, doctor's quote, or retracted paper does not.",
  image_context: "The earliest dated copy of the image and its original publisher settle where and when it was taken.",
  other: "Prefer the primary source that owns the fact. Many sites copying one report count once.",
};

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;
/** A developing story: the answer may change within the hour. */
const BREAKING = 15 * MINUTE;

/** How long the cache keeps answering a Claim of this type with its saved Result (docs/architecture.md §6). */
const CACHE_SECONDS: Record<ClaimType, number> = {
  death_health: BREAKING,
  disaster_weather: BREAKING,
  govt_scheme_law: DAY,
  money_banking: DAY,
  election: DAY,
  other: DAY,
  statistics: 7 * DAY,
  science_health: 30 * DAY,
  image_context: 30 * DAY,
};

/** The cache lifetime for a saved Result: short while the answer may still move (Not confirmed yet, Evidence
 * under 7 days old, a photo search that didn't run), else its Claim type's. No Claim is a photo on its own. */
export function cacheSeconds(claimType: ClaimType | null, result: Pick<Result, "verdict" | "evidence" | "photoCheck">): number {
  const weekAgo = new Date(Date.now() - 7 * DAY * 1000).toISOString().slice(0, 10);
  const moving =
    result.verdict?.label === "unconfirmed" ||
    result.evidence.some((e) => e.date !== null && e.date >= weekAgo) ||
    result.photoCheck?.matches === null;
  return moving ? BREAKING : CACHE_SECONDS[claimType ?? "image_context"];
}
