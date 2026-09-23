# Gap research: demo claims, fact-check lookup, image tools, cost

Written 2026-09-23. Fills the gaps left by `claim-verification-approaches.md` (it doesn't cover
any of the topics below). **[inference]** = my judgement, not a sourced finding.

---

## 1. The demo claims: facts checked

### Dharmendra: he really did die, 13 days after the false reports
- 31 Oct 2025: hospitalised with breathing difficulty. 10 Nov: readmitted, put on a ventilator.
- **11 Nov 2025: false death reports.** Several news channels ran them, and Defence Minister
  Rajnath Singh and Javed Akhtar posted condolences. Wife Hema Malini and daughter Esha Deol
  denied it the same day ("stable and recovering").
- **24 Nov 2025: he actually died** at home, aged 89.
Sources: https://en.wikipedia.org/wiki/Dharmendra ·
https://www.business-standard.com/india-news/dharmendra-bollywood-actor-health-stable-mumbai-hospital-family-125111100169_1.html ·
https://www.khaleejtimes.com/entertainment/dharmendra-daughter-denies-death-reports

**What this changes (it matters a lot):**
- Pasting "Dharmendra has died" **today** should come back **Supported**, not Refuted. A judge
  who tries it will expect that answer.
- The claim was false *on 11 Nov* and true *from 24 Nov*. So a verdict needs a **"claim time"**
  (when the message was sent, defaulting to now), and evidence has to be judged against that date.
- **Demo gold [inference]:** run the same claim twice, once "as of 11 Nov 2025" (Refuted, because
  the family denied it) and once "as of today" (Supported). That shows off the time-awareness in
  about 10 seconds. Research calls temporal verification an under-studied gap, so it's a real
  differentiator: https://aclanthology.org/2024.emnlp-industry.48/ · https://arxiv.org/html/2410.14964
- **It proves the authority rule:** a *cabinet minister* got it wrong. "Official" isn't enough on
  its own. For a death claim, only family, hospital or the person's own team settle it.
  Authority depends on the claim type, not on how senior the source is.

### Amitabh Bachchan: a recurring hoax
- Death hoaxes went round in 2012, 2015 and 2016 (the WhatsApp "died at 11 AM" forward with old
  photos), plus a fake hospitalisation story in March 2024 that he answered by appearing in public
  the same evening.
  https://www.india.com/entertainment/amitabh-bachchan-dead-hoax-whatsapp-messages-on-bigbs-death-bad-health-goes-viral-979943/ ·
  https://www.tribuneindia.com/news/trending/fake-news-amitabh-bachchan-on-reports-of-his-hospitalisation-posts-photos-attending-ispl-2024-finals-with-son-abhishek-and-sachin-tendulkar-601145/amp
- ⚠️ **mediamass.net** publishes auto-generated "X dead 2026" hoax pages about celebrities, and it
  showed up in the search results. **Put it on the blocked/unreliable domain list.** It's also a
  live example of a poisoned search result for the pitch.
- **Re-check that he's alive on demo day** before presenting.

---

## 2. New find: Google Fact Check Tools API (free, not in the first research doc)

- `GET https://factchecktools.googleapis.com/v1alpha1/claims:search?query=...&key=...`
- **Free**, no per-call charge. Params: `query`, `languageCode` (e.g. `hi`), `maxAgeDays`,
  `reviewPublisherSiteFilter`, `pageSize`.
- Returns claims, and for each one: `publisher {name, site}`, `url`, `title`, `reviewDate`,
  `textualRating` (e.g. "False"), `languageCode`.
Sources: https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search ·
https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims

**[inference] Use it as step 0:** it's free and runs before the paid OpenAI search (~₹5). A hit
fills the "an existing fact-check exists" slot (research doc item 12). It never counts as
independent evidence, but for a well-known hoax it's the fastest honest answer.

**Trusted Indian fact-checkers** (IFCN verified signatories, active): BOOM, Factly, Fact
Crescendo, India Today Fact Check, NewsMobile, Newschecker, Newsmeter, The Quint (WebQoof),
Vishvas News, The Lallantop, Youturn, D-FRAC, Digiteye, First Check, Telugupost, THIP.
Alt News is widely respected but hasn't been an IFCN signatory since April 2020. Add PIB Fact
Check (the government's) as its own category.
https://ifcncodeofprinciples.poynter.org/signatories · https://en.wikipedia.org/wiki/Alt_News

---

## 3. Image tools: prices checked

| Tool | Free tier | After that | Card needed? | Verdict |
|---|---|---|---|---|
| **Google Cloud Vision** `WEB_DETECTION` (reverse image search) | 1,000/month | $3.50 / 1k | Yes (GCP billing account) | **Pick this** |
| SerpApi Google Lens | 250/month, 50/hour | $25/month for 1k | No for free tier | Backup if GCP billing setup is a hassle |
| **Sightengine** AI-image detection | 2,000 ops/month, max 500/day; AI check = 5 ops, so **~400 checks/month, 100/day** | $29/month | No | **Pick this** (optional signal) |
| Hive AI detection | $50 credit | $6 / 1k images, 100 req/day | Yes | Skip |
| `exifr` (npm), EXIF metadata | Free library | — | — | Use it. Works in browser and Node, reads DateTimeOriginal + GPS |
| `@contentauth/c2pa-node` (C2PA credentials) | Free library | — | — | Use it. **Needs Node 22+**, native binary |

Sources: https://cloud.google.com/vision/pricing · https://serpapi.com/pricing ·
https://sightengine.com/pricing · https://thehive.ai/pricing ·
https://github.com/MikeKovarik/exifr · https://www.npmjs.com/package/@contentauth/c2pa-node ·
https://opensource.contentauthenticity.org/docs/c2pa-node/

- **[unverified]** Whether c2pa-node's native binary runs on Vercel serverless functions. Test
  it early. If it doesn't, drop C2PA, because it's the weakest-value signal anyway.
- **[unverified]** Neither Vision nor Lens returns a *publish date* per matching page. The
  "earliest page with this image" signal from the first doc means fetching those pages and
  reading their dates (`article:published_time` meta tag). That's extra work, so budget for it.

---

## 4. Caching: Upstash

- Redis free tier: **500K commands/month, 256 MB**, 10 GB bandwidth. That's far more than a
  hackathon needs. (The old 10K/day limit was replaced in March 2025, so ignore older blog posts.)
  https://upstash.com/pricing/redis · https://upstash.com/blog/redis-new-pricing
- Upstash Vector (for the "same claim, different wording" cache) not checked. **[inference]**
  For the demo, the exact-text cache plus pre-warmed demo claims covers it. Add the similarity
  cache only if time allows.

---

## 5. Hindi / Hinglish

- Research on multilingual fact-checking consistently finds LLMs do worse in lower-resource
  languages than in English. No Hindi-specific numbers found.
  https://acl-bg.org/proceedings/2025/RANLP%202025/pdf/2025.ranlp-1.131.pdf ·
  https://arxiv.org/abs/2509.25138
- **[inference] Plan:** turn the claim into English for the cache key and the main search (as
  already decided). Also run Fact Check API with `languageCode=hi`, and set web_search
  `user_location` country `IN`. **Test it on a real Hindi forward in the first hour.** A test
  answers this faster than more reading.

---

## 6. Still unproven (say so if judges ask)

- **"Many outlets in the same few minutes = copying"** is a sensible rule, but I found no study
  measuring it. Journalism calls it *circular reporting*: many sources that all trace back to
  one. https://en.wikipedia.org/wiki/Circular_reporting
  In the pitch, present it as a design rule, not as a proven method.

---

## 7. Cost per check, updated [inference]

| Step | Cost |
|---|---|
| Fact Check API | free |
| OpenAI web search, ~3–6 searches | ~$0.03–0.06 (~₹3–5) + tokens |
| Reverse image search (Vision) | free for first 1,000/month |
| AI-image detector (Sightengine) | free up to 100/day |
| Cache hit | ~free |

---

## 8. Can a Google Fact Check API result be wrong? Yes.

- **Google doesn't check the verdicts.** Publishers label their own articles (ClaimReview
  markup). Google only checks eligibility: a corrections policy, clear sourcing, no political
  parties, and markup that matches the page. It never checks whether the rating is right.
  https://developers.google.com/search/docs/appearance/structured-data/factcheck
- Google removed fact-check snippets from Search in June 2025. The Explorer and the API still
  work, but the program is being scaled back, so don't depend on it alone.
  https://www.poynter.org/ifcn/2025/google-claimreview-fact-checks-snippets-removed/

**How it goes wrong, and the guard for each [inference]:**
| Failure | Example | Guard |
|---|---|---|
| Out of date | An 11 Nov 2025 "FALSE: Dharmendra is alive" fact-check was wrong by 24 Nov | Compare `reviewDate` with the claim date. For claims that can change (death, health, ongoing events), treat an older fact-check as "may be outdated" and re-verify |
| Wrong claim matched | "Amitabh hospitalised" matching a different year's story (he really was hospitalised with COVID in July 2020) | An LLM check that it's the same person, event and date; otherwise discard it |
| Biased/poor fact-checker | Indian fact-checkers accuse each other of bias | Only IFCN signatories + PIB count; others labelled "unverified fact-checker" |
| Fact-checkers disagree | — | Show both and let the verdict become "Conflicting" |
| Messy labels | "Misleading", "Half True", "Satire", "Missing context" | Map `textualRating` to our 4 labels |

**Rule:** a fact-check is a *lead*, not the verdict. It never counts as independent evidence,
and we still run our own search.

---

## 9. Demo claim 3: real photo, wrong story (melted traffic lights)

**Viral claim (late June 2026):** videos of traffic lights "melting" in the European heatwave,
supposedly in Italy and Germany.
**Reality** (Full Fact, 3 July 2026, rated False):
- Italy clip: **Lugagnano, 23 June 2026**. A vehicle/scooter fire right under the traffic light.
- Germany clip: **Berlin, June 2025**, a year *before* the heatwave. A fire at the Wilde Renate club.
- They traced it by geolocation (matching buildings in the background) + local news footage + DPA.
Sources: https://fullfact.org/environment/video-traffic-light-melting-heatwave-false/ ·
https://climatefactchecks.org/no-europes-heatwave-isnt-melting-traffic-lights-trolleys-and-car-parts-heres-whats-really-going-on/ ·
https://www.snopes.com/fact-check/melted-traffic-light/ (older versions in other countries, so a *recurring* hoax)

Note: the "volcanic eruption in Brazil" version from yesterday's chat doesn't match any source
found. Brazil has no active volcanoes. Use the fire version above.

**How TruthAgent should handle it [inference]:**
1. Vision model: "melted traffic light". Extract the claim: "the Europe heatwave melted this".
2. Reverse image search: finds pages from June 2025 (Berlin fire), **older than the heatwave**,
   so it's out of context. This is the decisive signal.
3. Common-sense check: heatwave air is ~40–45 °C. Signal plastic softens far hotter than
   that (well over 100 °C; exact figure to confirm). The model states this as explanation,
   not proof.
4. Fact Check API: Full Fact / Snopes hit, shown as "existing fact-check".
5. The card answers **two separate questions**:
   - Is the image real? **Yes**, genuine photo of genuine damage.
   - Is the story true? **No**, fire damage, and one clip is a year older than the heatwave.
