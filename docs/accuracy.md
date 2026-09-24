# Accuracy run

`npm run accuracy` sends every Claim in `lib/accuracy/claims.json` through `check()` against the live
APIs. Fact-checking sites are blocked (`blockFactCheckers()` in `lib/engine/sources.ts`), so the score
measures our agent and not a copied answer. Nothing is cached or saved to Redis. A full live run costs about
$0.70 of the $4 budget and takes about 6 minutes.

Each live run saves every Claim's outside answers (search turns, pages, Origins) as a replay Scenario in
`.data/accuracy/<id>.scenario.json`. `npm run accuracy -- --reverdict` replays those and runs only the
Verdict live: about 1 minute and about 10 cents (mostly sol). Use it to tune anything in `verdict.ts` or
`confidence.ts`. A change to the agent, search or Evidence stages needs a live run, since the saved answers
wouldn't change. `--only=<id>,<id>` runs just those Claims, in either mode. Every run writes what each
Check saw and decided to `.data/accuracy/<id>.last.json`: start there when a Claim goes wrong.

Two numbers are printed. **Exact** is our label equal to the fact-checker's. **Right way** is true for a
true Claim, and any of False, Misleading or Outdated for one that isn't. Each of those tells the user not to
trust the forward as it stands, and fact-checkers themselves split on False vs Misleading. Not confirmed
yet never counts as the right way.

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

## Results, 2026-09-24

| | Exact | Right way | Escalated to sol |
|---|---|---|---|
| First full live run (15 Claims) | 6/15 (40%) | — | 53% |
| Live run, 17 Claims, before the Verdict fixes | 10/17 (59%) | — | 47% |
| Same saved Evidence, Verdict fixes (2 runs, same result) | **13/17 (76%)** | **16/17 (94%)** | 18% |

Exact, per label, after the fixes: True 4/4, False 4/7, Misleading 4/4, Outdated 1/2.

The same Claim can land differently from one live run to the next (`false-500-march-2026` flipped with no
code change), so treat a difference of 1–2 Claims as noise.

### What was wrong, and the fix

Every miss in the 17-Claim live run was in the Verdict step. The agent found the right Authority pages (RBI,
PIB, the CBDT clarification, GST Council, Bangladesh's PM's Office); the Verdict threw them away:

- **"The future can't be proven" → Not confirmed yet**, even with the RBI denying a ₹5000 note. Fix: a Claim
  that something official will happen says it has been decided; if the Authority denies it and nothing shows
  it was decided, it's False.
- **No line between Misleading and False.** "A real rule, stretched to everyone" came back False. Fix: False
  means what the Claim describes doesn't exist; Misleading means it's real but the scope or meaning is wrong.
  True holds even when a minor exception is left out (GST 2.0 was being marked down over a tobacco exception).
- **Misleading answers overturned by escalation.** Both luna runs said Misleading at 75–82%, but Evidence on
  both sides counted as "Independent sources disagree", so sol decided, played safe, and code turned it into
  Not confirmed yet. Fix: for Misleading and Outdated, Evidence on both sides is what the label means, so it
  isn't a Hard-claim trigger (CONTEXT.md updated).
- **Not confirmed yet as an escape hatch.** Redefined: only when the Evidence can't tell whether the core is
  true. Not for an unproven detail.
- **Undated official pages trusted for nothing.** An undated page was read today, so it now counts as showing
  how things stand now. Any country's `.gov.xx` domain is now tier 1, not only India's and the US's.

### Still wrong, and why it's left

- `false-bank-weekends`, `false-bbc-chandrayaan-3` → Misleading. The model's reasoning is fair: a real
  holiday rule and a real BBC question, framed wrong. Fact-checkers split on exactly this line (BOOM rated the
  similar ISRO-dance video Misleading, Alt News rated it False). Pushing the prompt harder against 17 Claims
  would fit one fact-checker's taste, not accuracy. Both still point the user the right way.
- `outdated-hasina-pm` → False. The search found who is Prime Minister now, not that she was before, and the
  Verdict only uses Evidence. Fix belongs in the agent prompt ("for a Claim that may once have been true, find
  when it changed"), which needs a full live run to test.
- `false-india-exits-who` → Not confirmed yet. The only denial found is from January 2025.

**Caveat:** the fixes were tuned on these same 17 Claims. Each rule is a general one from fact-checking
practice or our own spec, not a patch for one Claim, but the next set of new Claims is the real test.
