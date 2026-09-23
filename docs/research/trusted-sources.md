# Trusted sources by claim type

Written 2026-09-23. Feeds the domain-tier map (research doc item 13) and the web_search
`filters.allowed_domains` "high-trust mode" (max 100 domains).

**Core rule:** trust depends on the claim type. A health ministry settles a vaccine claim
but not a death rumour. A minister's tweet isn't proof (Dharmendra, 11 Nov 2025). The
**primary source** is whoever *owns* the fact: the family for a death, RBI for currency,
the Election Commission for results.

**How to fetch:** 🔌 = free/public API · 🔎 = no API, reach it through OpenAI web_search
restricted to that domain · 💳 = paid. API details come from prior knowledge and were **not
re-checked today**. Confirm each one before building on it.

---

## 0. Already fact-checked? (check first, it's free)

| Source | Covers | Fetch |
|---|---|---|
| Google Fact Check Tools API | Fact-checks from every ClaimReview publisher worldwide | 🔌 free, API key |
| **PIB Fact Check** (pib.gov.in, @PIBFactCheck) | Fake govt schemes, fake circulars, fake "govt bans X" | 🔎 |
| Indian IFCN signatories: BOOM, Factly, Newschecker, Vishvas News, India Today Fact Check, The Quint WebQoof, Fact Crescendo, NewsMobile, Newsmeter, The Lallantop | Indian viral claims, WhatsApp forwards, Hindi and regional | 🔎 (most also appear in the Google API) |
| Alt News | Indian communal/political images and videos | 🔎 (not IFCN since 2020, but widely cited) |
| Reuters Fact Check, AFP Fact Check, AP Fact Check | Global viral claims | 🔎 |
| Snopes, PolitiFact, Full Fact | US/UK claims, urban legends | 🔎 |

These count as "an existing fact-check", **not independent evidence** (research item 12).

---

## 1. Health and medicine (fake cures, vaccine myths, "doctors say")

| Source | Fetch |
|---|---|
| WHO (who.int), incl. "Mythbusters" pages; WHO GHO data API | 🔎 / 🔌 |
| India: MoHFW (mohfw.gov.in), ICMR (icmr.gov.in), CDSCO (drug approvals/bans), FSSAI (food safety) | 🔎 |
| CDC, NIH/MedlinePlus (US) | 🔎 / 🔌 MedlinePlus |
| **PubMed** (research papers) | 🔌 free E-utilities API |
| Cochrane Library (evidence summaries) | 🔎 |
| **Retraction Watch database** (is the paper retracted?) | 🔌 free via Crossref API |

## 2. Government, law and schemes ("new rule from 1 Jan", fake schemes)

| Source | Fetch |
|---|---|
| **PIB press releases** (pib.gov.in), the official voice of every ministry | 🔎 |
| **e-Gazette** (egazette.gov.in): if a law or rule isn't gazetted, it isn't in force | 🔎 |
| India Code (indiacode.nic.in), all central acts | 🔎 |
| PRS Legislative Research (prsindia.org): bills, what actually passed | 🔎 |
| Sansad (sansad.in): Parliament debates, for "MP said X in Parliament" | 🔎 |
| Supreme Court (sci.gov.in), High Court sites; Indian Kanoon for judgments | 🔎 / 💳 Kanoon API |
| MyScheme (myscheme.gov.in): is a govt scheme real? | 🔎 |

## 3. Money, banking and scams ("₹2000 note banned", "RBI new rule", lottery/KBC forwards)

| Source | Fetch |
|---|---|
| **RBI** (rbi.org.in): notes, bank rules, press releases; **RBI Sachet** for unauthorised deposit-takers | 🔎 |
| SEBI (sebi.gov.in): fake stock tips, unregistered advisers | 🔎 |
| NSE/BSE corporate announcements: "Company X is shutting down" | 🔎 |
| MCA21 (mca.gov.in): does this company exist? | 🔎 |
| Sanchar Saathi / Chakshu (DoT), cybercrime.gov.in, CERT-In advisories | 🔎 |
| **Google Safe Browsing API**: is the link in the forward a known phishing/malware site? | 🔌 free (non-commercial) |
| VirusTotal: URL reputation | 🔌 free tier, rate-limited |

## 4. Elections and politics ("EVM hacked", fake results, fake quotes)

| Source | Fetch |
|---|---|
| **Election Commission of India** (eci.gov.in, results.eci.gov.in) | 🔎 |
| Official party/leader accounts and PIB, for "leader said X" (check the original video/transcript) | 🔎 |
| Sansad debates, for quotes made in Parliament | 🔎 |

## 5. Disasters, weather and emergencies ("earthquake in Delhi now", "cyclone coming")

| Source | Fetch |
|---|---|
| **IMD** (mausam.imd.gov.in): warnings and cyclones | 🔎 |
| **USGS Earthquake API**: every earthquake worldwide with time, place and size | 🔌 free, no key |
| NCS (seismo.gov.in): Indian earthquakes | 🔎 |
| NDMA (ndma.gov.in), state disaster authorities | 🔎 |
| **ReliefWeb API** (UN OCHA): disasters and crises | 🔌 free |
| GDACS: global disaster alerts | 🔌 feeds |
| **Open-Meteo historical weather API**: "did it snow/flood in X on date Y?" | 🔌 free |
| NASA FIRMS: fires seen from satellite | 🔌 free key |

## 6. Numbers and statistics ("India's GDP is X", "crime up 300%")

| Source | Fetch |
|---|---|
| **data.gov.in**: Open Government Data | 🔌 free key |
| MoSPI (mospi.gov.in): GDP, inflation, surveys | 🔎 |
| NCRB (ncrb.gov.in): crime statistics | 🔎 |
| Census of India, RBI DBIE (economic data) | 🔎 |
| **World Bank API**, IMF data, UN data | 🔌 free |
| Our World in Data (clean, sourced charts) | 🔌 CSV/JSON downloads |

## 7. Science and space ("NASA says 6 days of darkness", ISRO hoaxes)

| Source | Fetch |
|---|---|
| NASA (nasa.gov), ISRO (isro.gov.in), ESA | 🔎 / 🔌 some NASA APIs |
| Crossref API (does this paper/DOI exist?) | 🔌 free |
| Peer-reviewed journals via PubMed / Crossref | 🔌 |

## 8. People and celebrities (death rumours, fake quotes, fake endorsements)

| Source | Fetch |
|---|---|
| **The person's own verified accounts, family statements, hospital bulletins** (the only real authority for death/health) | 🔎 (X/Instagram are hard to fetch directly; rely on news *quoting* them) |
| Wikipedia / **Wikidata API** (date of death, basic facts) | 🔌 free, but **supporting evidence only**. It can be edited during a rumour, and news outlets have copied false Wikipedia edits before (circular reporting) |
| Wikiquote, for "did X really say this?" | 🔌 free |

## 9. Images, videos and old content resurfacing

| Source | Fetch |
|---|---|
| **Google Cloud Vision web detection** (reverse image search) | 🔌 1,000/month free |
| **Wayback Machine** (web.archive.org): what a page said *on a date*, deleted pages, earliest appearance | 🔌 free (CDX / availability API) |
| Sightengine: AI-image signal | 🔌 ~100/day free |
| TinEye | 💳 |
| InVID-WeVerify: video keyframes (browser plugin, not an API) | manual |

## 10. History and religion (distorted history, fake "ancient" facts)

| Source | Fetch |
|---|---|
| Archaeological Survey of India (asi.nic.in), National Archives (abhilekh-patal.in) | 🔎 |
| Encyclopaedia Britannica | 🔎 |
| Academic sources via Crossref / JSTOR | 🔌 / 💳 |

---

## Do not trust (block list)

- **mediamass.net**: auto-generated celebrity death hoaxes
- Satire sites (Faking News, The Onion, etc.): treat as "satire", not evidence
- Content farms / AI-generated sites with no author or date **[inference]** detect via
  missing byline/date, not a list
- **Any source that only quotes "sources say"** on death/health claims. This is how the
  Dharmendra reports spread.

## Build notes [inference]

1. Step 0 = Google Fact Check API (free). Step 1 = the claim-type authority list above goes
   into the prompt as text, so the model knows who can settle this kind of claim.
2. Use only a handful of real APIs in 36h: Fact Check, USGS, Open-Meteo, Wayback, Safe
   Browsing. Everything else goes through web_search with `allowed_domains`.
3. Nice demo slot: a scam forward with a link → Safe Browsing flags it → "PIB Fact Check says
   this scheme doesn't exist". It shows the tool covers more than news.
