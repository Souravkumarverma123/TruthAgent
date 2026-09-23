// Source knowledge: plain data, seeded from docs/research/trusted-sources.md.
import type { ClaimType, Tier } from "./schemas.ts";

/** A domain entry matches itself and its subdomains. */
function matches(hostname: string, domains: string[]): boolean {
  return domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/** Never Evidence: auto-generated death hoaxes and satire. Bare domains, no scheme
 * (the web_search `blocked_domains` format). */
export const BLOCKED_DOMAINS = ["mediamass.net", "fakingnews.com", "theonion.com"];

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
  "prsindia.org",
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

/** Tier 2: fact-checkers and major outlets, incl. the news agencies. Wikipedia is left at tier 3:
 * it can be edited during a rumour (trusted-sources.md §8). */
const TIER_2 = [
  // Fact-checkers
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
  // News agencies and major outlets
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
