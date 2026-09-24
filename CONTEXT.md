# TruthAgent

Checks whether what people forward is true, and shows the proof in plain language for non-technical users.

## Language

### Input

**Message**:
Everything the user submits in one go: text, an image, or both.
_Avoid_: query, post, forward (as a term)

**Claim**:
One checkable statement inside a Message. A Message holds at most 3.
_Avoid_: fact, statement, assertion

**Main claim**:
The Claim the Message is really about; its Verdict is the headline.

**Opinion**:
A part of a Message that can't be true or false; shown, never checked.
_Avoid_: value claim

**Claim date**:
The date a Claim is judged against. Today unless the user sets it.
_Avoid_: timestamp

### Checking

**Check**:
One run of TruthAgent on a Message, from submission to Result.
_Avoid_: fact-check (that means someone else's), verification job

**Fact-check**:
An existing verdict published by a fact-checking organisation. A lead, never Evidence.
_Avoid_: using it for our own Check

**Evidence**:
A quote from a source page, with its link, date and Stance toward a Claim.
_Avoid_: source, citation (a citation is a pointer to Evidence)

**Stance**:
Whether a piece of Evidence supports, contradicts, or is irrelevant to a Claim.

**Origin**:
Where a piece of Evidence's information first comes from, e.g. a family statement, the ANI wire, the outlet's own reporting.

**Independent source**:
Evidence with a distinct Origin. Fifteen sites copying one wire line are one Independent source.
_Avoid_: counting websites or articles

**Authority**:
Whoever owns the fact for a type of Claim: family or hospital for a death, RBI for currency.

**Hard claim**:
A Claim whose Verdict gets a second opinion from the stronger model: the two quick verdicts disagree, the top verdict is under 70% likely, or Independent sources disagree (except on a Misleading or Outdated verdict, where Evidence on both sides is what the label means).

### Output

**Verdict**:
The label for one Claim as of its Claim date: True, False, Misleading, Outdated, or Not confirmed yet.
_Avoid_: rating, result

**False**:
The core of the Claim was never true.

**Misleading**:
The facts are right but the framing or conclusion is wrong.
_Avoid_: half-true, missing context

**Outdated**:
The Claim was true at an earlier date and isn't as of its Claim date.

**Not confirmed yet**:
Not enough Independent sources either way; the honest answer during a developing story.
_Avoid_: unknown, unverified

**Photo check**:
The separate answer to "is the image real, and where and when did it first appear?". Independent of the Verdict: a real photo can carry a False Claim.

**Confidence**:
How strongly the Evidence backs a Verdict (High, Medium, Low), computed from the Evidence, with the reason in words.

**Result**:
The saved outcome of a Check: Verdicts, Evidence, reasoning, Photo check. It has a shareable proof page.
_Avoid_: report, response
