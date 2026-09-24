# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hackathon judges (design for first).** Binary Hacks 4.0, PS-05. They see the app live on a projector during the demo and on their own screens afterwards, and score it against the problem statement: autonomous agent, multimodal input, Evidence, citations, Confidence, reasoning.
- **People who receive forwards.** Non-technical people in India, often older, who got a WhatsApp forward (text, screenshot or photo) and want to know if it's true, then send the answer back to the family group. Phone-first.

## Product Purpose

TruthAgent checks whether a forwarded message is true and answers in plain words, with the proof: quoted, linked, dated Evidence, For and Against side by side, a Confidence with its reason, and a public proof page (`/check/<id>`) that can be shared back to the group. Success: a judge understands the Verdict and why within seconds of it appearing, and a non-technical user could forward the proof page without explaining it.

## Positioning

An autonomous agent whose trust work is done by code, not the model: quotes are checked against the page, Independent sources are counted by Origin (fifteen sites repeating one wire line are one source), citations can only point at Evidence the Check found, Confidence is computed from the Evidence, and "Not confirmed yet" is a real answer, decided by rule when no Independent source exists. A real photo can carry a false story, so the Photo check is separate from the Verdict.

## Operating Context

- Two surfaces: the input page (`/`: one box, one button, optional photo, live step list streamed as the agent works) and the proof page (`/check/<id>`: public, no login).
- The demo runs in replay mode on fixed Scenarios (see README "Demo Messages in replay"); the live steps appear quickly, the proof page is the moment judges study.
- Results live 30 days; a proof page shows "Checked X ago" and a Re-check button (not for photo Checks).

## Capabilities and Constraints

- Verdict labels: True, False, Misleading, Not confirmed yet (Outdated is planned, #9). Confidence: High, Medium, Low, with a reason in words.
- Reasoning steps are tagged Fact, Inference, Assumption, Hypothesis and cite Evidence ids (E1, E2…).
- Evidence items carry: quote, site link, trust tier (Official, Fact-checker or major outlet, Other site), date, Origin, "Quote not verified" flag, and "someone else's fact-check: a lead" flag.
- Photo check: Real (Yes / Probably not / Can't tell), reason, description, earliest copy found (site + date), EXIF details.
- Terms have exact meanings in `CONTEXT.md` (Claim, Evidence, Origin, Independent source, Verdict…); UI copy must use them consistently.
- Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui on Base UI, lucide-react. UI in `app/` and `components/`; no engine changes for UI work.
- Tests assert only on the Engine's output, so UI changes don't touch them.

## Brand Commitments

- Name: TruthAgent.
- The app must match the pitch deck's identity (Paper file "TruthAgent — Pitch deck"): white ground, ink `#101714`, evergreen `#1E5B45` as the single accent, mist `#EEF3F0` surfaces, slate `#5E6A65` secondary text, False red `#B8342A` and amber `#A86F17` reserved for Verdict states, Geist and Geist Mono. Confirmed by the user as binding.
- Voice: plain, calm, exact. Never a bare "FAKE"; "earliest copy we found", not "the original".

## Evidence on Hand

- Real demo Scenarios in `lib/engine/scenarios.ts` (Bachchan death hoax → False; ₹500 ban with 15 wire copies → 1 Independent source; ₹2000 withdrawal → True, High; free laptops → Not confirmed yet; traffic lights photo → Photo real, Verdict False).
- No testimonials, users, usage numbers or accuracy results exist yet (#15 is open); do not invent any.

## Product Principles

1. The Verdict is readable in one glance; the proof is one scroll away.
2. Show the work: every claim on screen traces to Evidence the user can open.
3. Honest uncertainty is a first-class answer, never styled as failure.
4. Plain words over jargon; exact project terms over synonyms.

## Accessibility & Inclusion

- Older users: large, readable body text and generous tap targets.
- Hindi Verdicts are planned (#14): layouts must tolerate longer strings and Devanagari.
- WCAG AA contrast at minimum; must read on a projector.
