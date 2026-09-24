# PS-05 requirements, read word by word

Binary Hacks 4.0 (2026), PS-05: "Agentic AI-Based Multimodal Claim Verification & Web Intelligence".
Written 2026-09-23. Each phrase of the problem statement is a requirement the judges can score.

## 1. Phrase → requirement → how we meet it

| # | Phrase | What it really demands | Our answer | Status |
|---|---|---|---|---|
| 1 | "inaccurate" | Plain false claims | Refuted → ❌ False | planned |
| 2 | "misleading" | Technically true but deceptive | Cherrypicking label → ⚠️ Misleading | planned, no demo case yet |
| 3 | "**outdated**" | Was true once, isn't now (old news reshared as new) | **Needs its own verdict: 🕰️ Outdated**, from claim date vs evidence date. AVeriTeC's 4 labels don't cover it | **GAP** |
| 4 | "taken out of context" | Real image/quote, wrong story | Reverse image search + page dates (traffic lights) | planned |
| 5 | "complex claims across multiple sources" | Multi-part messages; speed matters | Split only real separate claims; show progress live; cache | planned |
| 6 | "**autonomous** … **agent**" | The AI chooses its own next step, not a fixed script | Tool-calling loop: the model picks from fact-check / web search / reverse image / Wayback, checks "do I have enough?", stops. Show its steps live | **GAP**, current design is a fixed pipeline |
| 7 | "multimodal … text, images, or text-image combinations" | All three inputs must work | Text; image (incl. **screenshots of fake headlines/tweets**: read the text in them); image + caption (check the caption matches the image) | screenshots **GAP** |
| 8 | "identifies factual claims" | Separate checkable facts from opinions, jokes, predictions | Mark non-checkable parts as [value]/opinion and don't verify them | **GAP** |
| 9 | "decomposes them into verification tasks" | Explicitly required, and judged | Each claim → 2–4 questions to answer. **Show the task list on screen** | planned, must be visible |
| 10 | "searches credible sources" | Source quality | Trusted-source list by claim type (`research/trusted-sources.md`) | planned |
| 11 | "analyses evidence" | Per-source judgement | Each source: supports / contradicts / irrelevant + exact quote | planned |
| 12 | "**compares supporting and contradicting** information" | Both sides shown | **"For" vs "Against" columns** on the proof page; copied articles count once | layout **GAP** |
| 13 | "explainable verdict" | — | Verdict + one-line reason | planned |
| 14 | "evidence, citations" | — | Quotes + links from the search tool only (can't be invented) | planned |
| 15 | "confidence" | — | Built from evidence (independent sources, authority, agreement), explained in words | planned |
| 16 | "reasoning" | — | Step list tagged [fact]/[inference]/[assumption]/[hypothesis] | planned |
| 17 | "**Web Intelligence**" (title) | More than a verdict: what the web says about the claim | **Origin trace**: when/where it first appeared (earliest page, Wayback), how it spread | **GAP** |

## 2. Consequence for product shape

**Decided 2026-09-23: mobile-first web app only.** WhatsApp bot is not built; it's a
roadmap/pitch item ("next: forward to TruthAgent on WhatsApp"). Skill/MCP dropped, because
end users aren't technical. The web page has to be as simple as forwarding: one box (paste
text and/or add an image), one button, a big plain verdict at the top, proof below.

## 3. Accuracy plan (lead-engineer view)

1. **Measure first.** Build a test set of ~40 real claims with known answers, pulled from the
   Google Fact Check API (BOOM, Factly, Newschecker…), ~10 per type: false / misleading /
   outdated / out-of-context, plus some true ones. Run it after every change.
   **During testing, block fact-check sites from search**, or the agent just reads the answer
   and the score is fake.
2. **Pin the date.** Every claim gets "true as of when?" (fixes outdated + Dharmendra).
3. **Right authority per claim type.** Family for deaths, RBI for currency, IMD for weather.
4. **Count independent sources, not articles.** 20 copies of one story = 1.
5. **Citations only from tool output.** Structurally impossible to invent a link.
6. **Say "Not confirmed yet" when unsure.** A wrong confident answer is worse than an honest
   "unknown". Accuracy on what we *do* answer is what users trust.
7. **Strongest model for the final verdict only.** Cheap model for the small steps.
8. **Check itself.** Run the final verdict twice; if the two runs disagree, lower confidence.

## 4. Decisions from the grilling session (2026-09-23)

Terms are defined in `CONTEXT.md`.
1. **Verdict per Claim.** Headline = Main claim's Verdict + "1 of 3 claims is false". Max 3 Claims.
2. **Labels:** False = never true · Misleading = facts right, framing wrong · Outdated = true
   earlier, not as of the Claim date. Traffic lights = False; "photo is real" is the Photo check.
3. **Claim date** = today; optional "When did you get this?" under More options (demo: Dharmendra).
4. **Image with no text** → Photo check only + nudge "paste the message that came with it".
5. **Language:** Verdict + one-liner in the user's language, English and Hindi only; both stored
   when the Result is saved.
6. **Daily cap** counts new Checks only; demo claims pre-warmed; a secret demo-pass cookie skips it.
7. **Cut order:** origin trace → Sightengine (cut 2026-09-24) → Hindi → reworded-claim cache → sol escalation.
   Never cut: Verdict + citations, live steps, reverse image search, Confidence, For vs Against.
8. **Independent sources** are counted by Origin, not by website.
9. **Team:** 5 people, all know full-stack Next.js. Plain Next.js app (ADR 0001). Issues on GitHub.
10. **Test seam:** one, the engine entry point `check(message) → live steps + Result`. Outside
    calls go through one boundary with replay (recorded, $0) and live modes.
