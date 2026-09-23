// Source knowledge: plain data, seeded from docs/research/trusted-sources.md.
// Trust tiers per domain are added by issue #5.
import type { ClaimType } from "./schemas.ts";

/** Never Evidence: auto-generated death hoaxes and satire. Bare domains, no scheme
 * (the web_search `blocked_domains` format). */
export const BLOCKED_DOMAINS = ["mediamass.net", "fakingnews.com", "theonion.com"];

export function isBlocked(hostname: string): boolean {
  return BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
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
