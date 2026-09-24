# Accuracy run

`npm run accuracy` sends every Claim in `lib/accuracy/claims.json` through `check()` against the live
APIs. Fact-checking sites are blocked (`blockFactCheckers()` in `lib/engine/sources.ts`), so the score
measures our agent and not a copied answer. Nothing is cached or saved to Redis. A full run costs about
$0.50–1 of the $4 budget, so run it only after a prompt or rule change. Use
`npm run accuracy -- --only=<id>,<id>` to re-run just the Claims you changed.

## The set

17 Claims: 4 True, 7 False, 4 Misleading, 2 Outdated. The False and Misleading answers come from Google
Fact Check results (BOOM, Factly, The Quint, Alt News, FactChecker.in). Two of the False ones are out of
context: an old clip or story reshared as new. Fact-checkers rarely rate True or Outdated Claims, so those
answers come from dated primary or news reports. Claims whose fact-checkers disagreed on the label were
left out.

**Stricter than the spec:** web_search blocks whole domains, not paths, so blocking The Quint's and PTI's
fact-check desks also blocks their ordinary news. PIB Fact Check stays open: it's the Authority for
government Claims (`AUTHORITY_RULES`), not an outside fact-checker.

## Demo Claims (spec "Demo Claims: still needed")

| Label | Claim | Why it's that label |
|---|---|---|
| Misleading | "18% GST is applicable on education in India." | 18% applies only to private coaching; schools and colleges are GST-free (Factly). |
| Outdated | "GST on small cars in India is 28%." | True until 21 Sept 2025; GST 2.0 moved small cars to 18%. |

Each got the right label in its one live run (the Outdated one in the full run, the Misleading one in a
separate 3-Claim run). #17 pre-warms them for the demo.

## Baseline, 2026-09-24

Full run of the 15 Claims the set held then:

| Expected | Right |
|---|---|
| True | 3/4 |
| False | 2/6 |
| Misleading | 0/3 |
| Outdated | 1/2 |
| **Overall** | **6/15 (40%)** |

Escalated to sol: 53% of Checks with a Verdict (the design expects far fewer).

Separate run of 3 Misleading Claims: GST on education right; UPI fee and tax clearance came back False.

Since then, `misleading-atm-500` was dropped (fact-checkers split between Misleading and False), and
`false-bbc-chandrayaan-3` (out of context) was added. It hasn't been run live yet.

What went wrong:
- **False → Not confirmed yet (4 of 6).** With fact-checkers blocked, a hoax often has only 1–3
  Independent sources against it, and the two luna runs disagree or aren't sure, so sol can't settle it.
  Candidates: accept an official denial (PIB, RBI) as settling it on its own; ask the agent for the
  authority's own page.
- **Misleading: 4 of 5 wrong across both runs.** Tax clearance and UPI fee came back False, the other two
  Not confirmed yet. The Verdict treats "a real rule, overstated" as
  False. Candidate: sharpen the misleading definition in `verdict.ts`: "a real rule or fact, stretched to
  everyone or everything".
- **High escalation rate.** Driven by `luna_disagreed` and `sources_disagree`. Look again once the
  Verdict prompt changes.
