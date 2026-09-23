# TruthAgent architecture

Written 2026-09-23. Builds on `requirements.md` (what to build) and `research/` (why).
**[verify]** = must be confirmed in the first hour of building, not assumed.

## 1. The whole system on one page

```
Phone browser
  │  POST /api/check  (text and/or image, resized to ~1600px in the browser)
  ▼
Next.js API route (one serverless function, streams progress back as SSE)
  │
  ├─ ① Exact cache      Redis: hash(clean text + image hash) → result id ─── hit → done
  ├─ ② Understand       OpenAI: read image/screenshot, split claims, type, date, questions
  ├─ ③ Claim cache      Redis: hash(English canonical claim + date) → result id ─ hit → done
  ├─ ④ Lock             Redis SET NX, so 1,000 people checking one claim = 1 check
  ├─ ⑤ Agent loop       OpenAI picks tools itself, max 8 steps, each step streamed live
  │     tools: fact-check lookup · web search · reverse image · read page
  ├─ ⑥ Evidence         code: ids, domain tier, date, verify quotes, count independent domains
  ├─ ⑦ Verdict ×2       OpenAI: label + tagged reasoning, cites evidence ids only
  ├─ ⑧ Confidence       code: formula from evidence, not the model's own number
  ├─ ⑨ Origin trace     earliest dated page + reverse-image pages + Wayback
  └─ ⑩ Save             Redis: result (30 days) + cache pointers (TTL by claim type)
  ▼
/check/[id]  shareable proof page (the link people forward back to the group)
```

No other servers. External calls: OpenAI, Google (Fact Check + Vision), Upstash Redis,
optionally Sightengine.

## 2. Stack and why

| Piece | Choice | Why | Rejected |
|---|---|---|---|
| App | Next.js (latest, via `create-next-app`) App Router + TypeScript, one app | Frontend + API in one deploy; whole team knows it | Separate backend (FastAPI or Express); the tRPC monorepo starter (ADR 0001) |
| UI | Tailwind + shadcn/ui, mobile-first | Fast to build, looks finished | — |
| AI | `openai` SDK, **Responses API** | Vision, hosted web search, function tools and structured output in one API | LangChain/LangGraph/CrewAI: the loop is ~50 lines, frameworks add debugging pain |
| Schemas | Zod (`zodTextFormat` from `openai/helpers/zod`) | Model output is typed and validated | — |
| Cache + store + lock | Upstash Redis (`@upstash/redis`) | Free tier 500K commands/month; HTTP, works on Vercel | Postgres/Supabase (not needed), vector DB (later) |
| Progress | SSE over `fetch` stream | User sees agent steps live; keeps the connection alive | WebSockets (overkill); `EventSource` (GET only, can't send an image) |
| EXIF | `exifr` | Photo date/GPS/camera | — |
| Deploy | Vercel | Free, one command | Docker |

**Skipped for v1:** C2PA (weakest signal, native binary may not run on Vercel), embeddings/vector
cache, auth, database, USGS/Open-Meteo tools. Add only if the test set or demo needs them.

## 3. Models (OpenAI only, budget: $4 total)

Newer is **cheaper** here, not older (per 1M tokens, in/out, from OpenAI pricing page 2026-09-23):
`gpt-6-luna` $0.10/$0.50 · `gpt-6-sol` $2/$10 · `gpt-5.4` $2.50/$15 · `gpt-5.6-sol` $4/$20 ·
`gpt-5.5` $5/$30 · `gpt-6-astra` $10/$50. So older models don't save money; **luna** does.

| Job | Model |
|---|---|
| Everything by default: understand (incl. image/OCR), agent loop, stance, verdict | `gpt-6-luna` |
| Verdict, **only for hard claims** (automatic, see ⑦) | `gpt-6-sol` (small input, ~$0.03 a call) |
| `gpt-6-astra` | not used |

Cost per new check is mostly **web search** ($10/1k = $0.01 per search), not tokens:
| | all luna | luna + sol verdict |
|---|---|---|
| 3 searches | $0.030 | $0.030 |
| tokens (search results ~40k in) | ~$0.005 | ~$0.030 |
| **per check** | **~$0.035 (~₹3)** | **~$0.06 (~₹5)** |
| checks from $4 | ~110 | ~65 |

Money savers: max 3 web searches per claim, `search_context_size: "low"`, free Fact Check API
first, verdict run twice only with luna.
**[verify]** Model IDs with `GET /v1/models` on our key, and that the $10/1k search price applies to
luna. Put IDs in one `MODELS` object so a swap is a one-line change.

## 4. APIs and keys

| Service | Used for | Cost | Env var (server only, `.env.local`) |
|---|---|---|---|
| OpenAI | everything AI | ~₹3–5 per new claim (budget $4) | `OPENAI_API_KEY` |
| Google Fact Check Tools | "already fact-checked?" (a lead, never evidence) | free | `GOOGLE_API_KEY` |
| Google Cloud Vision `WEB_DETECTION` | reverse image search | 1,000/month free | same `GOOGLE_API_KEY` (restrict key to these 2 APIs) |
| Upstash Redis | cache, results, lock, rate limit | free tier | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Sightengine (optional) | "AI-generated?" signal | ~100/day free | `SIGHTENGINE_USER`, `SIGHTENGINE_SECRET` |
| Wayback CDX | earliest archived copy of a page | free, no key | — |

Keys never reach the browser or git.

## 5. Each step in detail

### ② Understand (one structured call)
Output per message (max 3 claims):
```
language, image_description, ocr_text,
claims[]: { original, canonical_en, checkable, tag: fact|value, claim_type, claim_date, questions[2-4] }
```
- `claim_type`: death_health · govt_scheme_law · money_banking · election · disaster_weather ·
  statistics · science_health · image_context · other. Drives authority rules, allowed sources, TTL.
- `claim_date`: when the message says it happened; default = now. Needed for "Outdated" and the
  Dharmendra case.
- Opinions (`tag: value`) are shown as "opinion, not checked".
- Decompose **less**: split only truly separate claims (over-splitting is a top error in research).

### ⑤ Agent loop (the "autonomous" part)
Responses API call with hosted `web_search` + our function tools. The model decides what to call;
we run function calls, send results back (`previous_response_id`), repeat. **Cap: 8 steps, ~60s.**

| Tool | Does | Backed by |
|---|---|---|
| `factcheck_lookup(query, lang)` | existing fact-checks with rating + review date | Google Fact Check API |
| `web_search` (hosted) | search, with `blocked_domains` (mediamass.net etc.), `user_location: IN` | OpenAI |
| `reverse_image()` | pages where this image appears, best-guess labels | Google Vision |
| `read_page(url)` | page text + published date (`article:published_time`, else Wayback earliest) | `fetch` |

System prompt contains: today's date, claim date, the authority rule for this claim type
(from `research/trusted-sources.md`), and "search for denials/retractions too".
Each tool call → SSE event → a line in the live step list ("Searching PIB Fact Check…").
Every tool has an 8s timeout; a failure goes back to the model as an error, the loop continues.

Loop ends with a structured list: `evidence[]: { url, quote, stance }`.

### ⑥ Evidence (code does the trust work, not the model)
- Give each item an id `E1..En`.
- **Quote check:** the quote must appear in the fetched page text, else it is dropped (or marked
  "not verified" if the page can't be fetched). This stops invented quotes.
- Domain → tier (1 official/primary · 2 fact-checker/major outlet · 3 other) from a map in
  `lib/sources.ts`.
- **Independent sources:** count distinct **Origins** (luna tags each piece of Evidence: own reporting, ANI/PTI wire, family statement, a tweet…), not websites or articles. Fact-check hits are a separate
  "already fact-checked" box and don't count.
- Fact-check guards: `reviewDate` older than the claim date on a changeable claim → "may be
  outdated"; `gpt-6-luna` check "same person, event, date?" → otherwise discard.

### ⑦ Verdict
Input: claims, claim date, evidence by id, authority rule. Structured output:
```
label: true | false | misleading | outdated | unconfirmed
one_line, image_real (yes/no/unknown, image only), story_true,
reasoning[]: { tag: fact|inference|assumption|hypothesis, text, evidence_ids[] },
alternatives[]: { label, probability },   // "top-k", better calibrated than one number
what_would_change
```
- Code drops any reasoning step whose `evidence_ids` don't exist → links can't be invented.
- **Escalation (decided 2026-09-23):** run the verdict twice with `gpt-6-luna` in parallel.
  Escalate to **one** `gpt-6-sol` verdict only when it's a hard claim:
  the two luna runs disagree · or luna's top label probability < 0.7 · or the for/against
  evidence is mixed (both sides have an independent domain). Easy claims never touch sol.
  If sol also can't settle it → `unconfirmed`. The proof page says which model decided.
- Internally maps to AVeriTeC labels (Supported / Refuted / Conflicting / Not enough evidence);
  **Outdated** = claim was true but the evidence shows it changed after `claim_date`, or old content
  reshared as new.

### ⑧ Confidence (code, from research §5)
```
confidence = 0.35 * probability of chosen label (from alternatives)
           + 0.25 * share of independent domains agreeing
           + 0.20 * source quality (tiers)
           + 0.20 * min(independent domains / 3, 1)
if no independent domain supports or contradicts → "Not confirmed yet", whatever the number
```
Shown as High / Medium / Low + "why" in words ("3 independent sources incl. RBI agree").
Weights are a guess, tuned against the test set. This function gets one small runnable check.

### ⑨ Origin trace ("Web Intelligence")
Earliest dated page among evidence + reverse-image matches (`read_page` for dates) + Wayback's
first snapshot. Wording is honest: "earliest copy **we found**: Berlin, June 2025".

## 6. Caching

Two layers of keys, both pointing to a stored result:

| Key | Built from | Catches | Cost of lookup |
|---|---|---|---|
| `exact:{hash}` | cleaned text (lowercase, spaces, emojis, "Forwarded" removed) + image SHA-256 | the same viral forward pasted again | free, before any AI |
| `claim:{hash}` | English `canonical_en` + claim date (day) | same claim, other wording or Hindi | one cheap luna call |
| `result:{id}` | the full proof page JSON | share links | stored 30 days |
| `lock:{claimhash}` | `SET NX EX 120` | a spike on one breaking claim runs one check; others wait | — |

**TTL of the cache pointers depends on the claim, not a flat number:**
| Situation | TTL |
|---|---|
| Death/health, "Not confirmed yet", or any evidence under 7 days old | 15 min |
| Govt rules, money, elections | 1 day |
| Statistics | 7 days |
| Old image in wrong context, history, settled science | 30 days |

Result page always shows **"checked 3 hours ago"** + a **Re-check** button (skips the cache).
Share links keep working after the pointer expires, because `result:{id}` lives 30 days.
Demo claims get pre-warmed. Semantic (embedding) cache: only if the canonical-claim key misses
too often in testing.

## 7. Protecting the credit
- Rate limit per IP: Redis `INCR ip:{ip}` + `EXPIRE 3600`, 5 new checks/hour. A public URL
  without this can drain the OpenAI balance.
- **Global cap:** max 30 new (uncached) checks per day, Redis counter. Past it: "Busy, try a
  claim we've already checked". Protects the $4.
- Max input: 2,000 characters, 1 image, 5 MB.
- OpenAI dashboard: hard spend limit.
- **Dev replay cache:** in development, save every OpenAI/Google response to a local file keyed
  by request hash and replay it. Building the UI costs $0 after the first real run.

**Budget plan for $4:** build/debug ~$0.30 (replay cache) · test set 15 claims × 2 runs ~$1 ·
pre-warm + rehearse demo ~$0.70 · judges live ~$1 · reserve ~$1.

## 8. Files (kept few)
```
app/page.tsx                 input box + live steps
app/check/[id]/page.tsx      proof page (shareable)
app/api/check/route.ts       SSE stream, runs the pipeline
lib/pipeline.ts              steps ②–⑩
lib/tools.ts                 fact check, vision, read_page, sightengine
lib/schemas.ts               Zod schemas
lib/sources.ts               domain tiers, block list, authority rule per claim type, TTLs
lib/cache.ts                 Redis helpers
lib/confidence.ts            formula + one self-check
scripts/eval.ts              runs the 40-claim test set (fact-check sites blocked), prints accuracy
```

## 9. First hour: settle the [verify] items
1. `GET /v1/models`: do gpt-6-luna and gpt-6-sol exist on our key, and what does one real check cost (OpenAI usage page)?
2. One Responses call mixing hosted `web_search` + a function tool: does it work, and does it return `sources`?
3. Vercel function time limit on our plan: does a ~60s agent run fit? (Streaming helps, but the limit still applies.)
4. A Hindi forward end to end.
5. Traffic light frame in Google Vision: does it find the Berlin/Lugagnano pages?
