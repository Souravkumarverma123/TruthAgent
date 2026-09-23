# TruthAgent — session handoff

**Written:** 2026-09-23
**Project:** `~/hackathon_project/TruthAgent`
**Next session focus:** continue building TruthAgent from where this session stopped

---

## 1. Where things actually stand

**No application code exists yet.** The repo contains exactly one thing: `docs/research/claim-verification-approaches.md`. No `package.json`, no Next.js app, no commits made this session.

The entire session was architecture brainstorming. The user has been offered scaffolding four times and has not yet said yes — they are still thinking through design. **Do not assume they want code written; ask, or wait for them to say go.**

## 2. Read these first — do not re-derive them

| Artifact | What's in it |
|---|---|
| `docs/research/claim-verification-approaches.md` (in repo, 576 lines) | Primary-source research: claim decomposition, query generation, stance classification, verdict labels, confidence calibration, out-of-context images, failure modes, and verified OpenAI API specifics incl. current model IDs and pricing. Every claim carries a source URL; `[inference]` and `[unverified]` tags mark what is extrapolation. **§1 "What to actually do" is a ranked, time-budgeted action list — start there.** |
| `~/.claude/projects/-Users-souravkumar/memory/truthagent-hackathon.md` | Stack decisions, hard constraints, layered-cache design, the authority-hierarchy insight, demo claims. Loaded automatically via MEMORY.md. |

Between those two, the stack, the pipeline design and the caching architecture are fully recorded. This document only covers what is in **neither** of them.

## 3. The image / deepfake strategy (conversation-only — capture this)

This was the last topic discussed and exists nowhere else.

**Three distinct problems, routinely conflated:**
1. **Out of context** — real photo, wrong story. Most common by far.
2. **Edited** — real photo, manipulated.
3. **AI-generated** — fully synthetic.

**Position taken on detection, and the reasoning:** AI-image detectors do not generalise to generators they weren't trained on, and social-media compression (WhatsApp forwards, the dominant distribution channel in the Indian context) destroys the pixel artifacts they depend on. The team should **not** stake the product on a detection accuracy claim.

**The strategic reframe — this is the key idea:**
> You usually don't need to prove the image is fake. You need to prove the claim is false.

An AI image captioned "explosion at Delhi airport today" is settled by checking whether an explosion happened — no forensics required. Image forensics is a *supporting signal*, not the verdict driver. This means the existing text pipeline already handles most deepfake cases.

**Agreed signal stack, cheapest first:**
1. **Reverse image search** — highest value. Finds the original, finds existing debunks, or finds nothing (itself a signal: real newsworthy events get photographed by news organisations). Research doc §6 is emphatic that out-of-context detection must route through this, because text search structurally cannot catch it.
2. **EXIF metadata** (~15 min) — presence of plausible camera data is mild positive evidence; absence proves nothing (platforms strip it).
3. **C2PA content credentials** (~30–45 min) — same asymmetry, stronger: a valid "AI-generated" signature is near-proof; absence is meaningless.
4. **Commercial detection API** (~1h, optional) — Hive / Sightengine / Reality Defender. Pricing and free tiers were **not** verified; check before committing.
5. **Vision model observations** (free, already in pipeline) — unreliable as a classifier, valuable as *explanation* (garbled signage text, wrong finger counts, inconsistent shadows).

**Output rule:** never a binary "FAKE". Render a per-check table with inconclusive results labelled inconclusive, then the assessment, then the decisive line — *"Even if this image were real, the claimed event did not happen."*

**Explicitly out of scope for 36h:** training a detector, fine-tuning, any custom vision model.

## 4. Open decisions — not yet made

- **Scaffolding not started.** User hasn't green-lit it.
- **Reverse image search provider unchosen.** SerpAPI (Google Lens engine) and Google Cloud Vision `WEB_DETECTION` both raised; research doc notes OpenAI's `search_content_types: ["image"]` is *not* a reverse-image-search substitute.
- **Upstash Redis / Upstash Vector** recommended for cache + TTL + single-flight lock, not confirmed by user.
- **Model IDs need verifying against the user's own key** (`GET /v1/models`) before hardcoding — the research doc lists current IDs from docs, but these postdate the assisting model's knowledge.
- **No API keys have been seen or handled in this session.** User stated only that they hold OpenAI credit and no Anthropic key.

## 5. Working with this user

- **Wants plain-language explanations.** Asked twice for jargon-free versions and responded well to concrete analogies. Avoid terms like "atomic decomposition", "calibration", "entailment" unless you define them inline.
- **Dismissed `AskUserQuestion` once** and answered in plain chat instead. Prefer conversational questions over the structured dialog.
- **Thinking about the pitch, not just the code.** Repeatedly frames things as "what if judges ask…". Framing advice for the demo is wanted, not noise.
- **Indian context matters** — uses rupees, Hindi/Bollywood examples, WhatsApp as the distribution channel. Chosen demo claims: the Amitabh Bachchan death rumour and the Dharmendra premature-death reports.
- Existing memory note: no spawning multiple agents unless asked; keep research shallow and build-relevant. (The one research agent this session was explicitly user-invoked.)
- Attribution for commits in this environment: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## 6. Suggested skills for the next agent

Call these via the `Skill` tool:

- **`ponytail:ponytail`** — auto-activates via a session hook, but be aware it governs the work: laziest solution that works, no speculative abstractions, no frameworks where a loop suffices. It is why LangChain/LangGraph/CrewAI were rejected. Honour that.
- **`impeccable:impeccable`** *or* **`frontend-design-ultimate`** — when building the verdict card. That card is the judged artifact; it deserves real design effort, not a JSON dump. Pick one, don't run both.
- **`run`** — for launching the Next.js dev server and verifying the UI in a browser before declaring anything done.
- **`mattpocock-skills:research`** — only if a genuinely new question arises. The existing research doc already covers pipeline design, labels, calibration, failure modes and the OpenAI API surface.

**Do NOT call `claude-api`.** Its own skip rule applies: another provider (OpenAI) is being worked on. The user has no Anthropic key and that skill would send you down the wrong path.

## 7. Suggested first move

Confirm with the user whether to scaffold now. If yes, the shortest useful path — consistent with the research doc's ranked list and the time budget already discussed:

1. `create-next-app` (TypeScript, Tailwind, App Router), one API route, hardcoded claim → OpenAI call → JSON rendered on screen. Proves the key works before anything is designed.
2. Then the three-stage pipeline: claim extraction (with the reflection pass — research §1.2 rates it the cheapest large win) → question-driven search → verdict synthesis where the model can reference evidence only by `id` and cannot emit a URL.
3. Then the verdict card.
4. Cache earlier than originally planned — at ~₹5 per verification it is cost control, not polish.
