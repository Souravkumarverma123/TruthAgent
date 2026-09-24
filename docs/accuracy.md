# Accuracy run

`npm run accuracy` sends every Claim in `lib/accuracy/claims.json` through `check()` against the live
APIs. Fact-checking sites are blocked (`blockFactCheckers()` in `lib/engine/sources.ts`), so the score
measures our agent and not a copied answer. Nothing is cached or saved to Redis. A full run costs about
$0.50–1 of the $4 budget, so run it only after a prompt or rule change. Use
`npm run accuracy -- --only=<id>,<id>` to re-run just the Claims you changed.

The expected labels come from Google Fact Check results (BOOM, Factly, The Quint, FactChecker.in), plus
dated news reports for the True and Outdated Claims, which fact-checkers rarely rate.

## Demo Claims (spec "Demo Claims: still needed")

| Label | Claim | Why it's that label |
|---|---|---|
| Misleading | "18% GST is applicable on education in India." | 18% applies only to private coaching; schools and colleges are GST-free (Factly). |
| Outdated | "GST on small cars in India is 28%." | True until 21 Sept 2025; GST 2.0 moved small cars to 18%. |

Both got the right label in the live run. #17 pre-warms them for the demo.

## Baseline, 2026-09-24 (15 Claims; the two newer Misleading Claims were run separately)

| Expected | Right |
|---|---|
| True | 3/4 |
| False | 2/6 |
| Misleading | 1/5 (the 3 in the full run plus UPI fee and GST on education, run separately) |
| Outdated | 1/2 |
| **Overall (first 15)** | **6/15 (40%)** |

Escalated to sol: 53% of Checks with a Verdict (the design expects far fewer).

What went wrong:
- **False → Not confirmed yet (4 of 6).** With fact-checkers blocked, a hoax often has only 1–3
  Independent sources against it, and the two luna runs disagree or aren't sure, so sol can't settle it.
  Candidates: accept an official denial (PIB, RBI) as settling it on its own; ask the agent for the
  authority's own page.
- **Misleading → False (2).** The Verdict treats "partly true, overstated" as False. Candidate: sharpen the
  misleading definition in `verdict.ts` with "a real rule or fact, stretched to everyone or everything".
- **High escalation rate.** Driven by `luna_disagreed` and `sources_disagree`. Look again once the
  Verdict prompt changes.
