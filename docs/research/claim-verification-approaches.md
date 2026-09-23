# Claim verification: what actually produces trustworthy verdicts

Research notes for TruthAgent (hackathon PS-05). Written 2026-09-23.

Constraints assumed: OpenAI only (Responses API), Next.js 15 + TypeScript, ~24h real build
time, no fine-tuning, no labelled dataset, 3-stage pipeline already decided
(extract -> per-claim agentic search -> synthesis) with confidence-keyed verdict caching.

Every substantive claim below has a URL. Anything that is my own inference rather than a
sourced finding is prefixed **[inference]**. Anything I could not verify is prefixed
**[unverified]**.

---

## 1. What to actually do

Ranked. Do them top-down; stop when you run out of hours.

### must-have

**1. Decompose *less* than you think. Cap sub-claims at roughly the input's sentence count.**
The "Decomposition Dilemmas" study (NAACL 2025) found performance rises with sub-claim count
and then falls: optimal results occur when the number of decomposed sub-claims stays *below*
the input complexity level measured in sentences, and over-decomposition is one of the two
most prevalent error types. They also recommend not decomposing simple inputs at all, because
decomposition and retrieval noise outweigh the gain.
→ Practical rule: single-sentence input = 1 claim, no decomposition. Paragraph = at most one
claim per sentence. Hard-cap the array length in your JSON schema.
Source: https://arxiv.org/html/2411.02400v1

**2. Add a reflection pass over the decomposition. It is the single cheapest large win here.**
Same paper: an LLM critique-and-correct step on its own decomposition moved F1 from 24.91 to
67.70 on BingChat data (FactScore setting) and 54.34 → 70.59 on FELM. One extra model call.
Source: https://arxiv.org/html/2411.02400v1

**3. Make claims "molecular", not atomic — decontextualize minimally.**
Fully atomic facts strip the entity/time/place context needed to verify them, and the verifier
then matches the fragment against evidence about a *different* entity. "Molecular Facts"
(Gunjal & Durrett, EMNLP 2024) defines two desiderata — *decontextuality* (stands alone) and
*minimality* (add the least disambiguating info that still maximises the chance of finding
evidence). Their two-step prompt: (a) ask the LLM what is ambiguous about the claim, (b) ask it
to rewrite adding only that. Molecular beat atomic and beat naive decontextualization on the
minimality/accuracy trade-off (52% minimal claims vs 16% for simple decontext).
→ Prefer "Swedish footballer" over "player for Hammarby IF born 1961": commoner descriptors
appear in more sources.
Source: https://arxiv.org/html/2406.20079

**4. Search with generated *questions*, not the claim string.**
The AVeriTeC shared task overview states plainly that generating questions rather than simply
searching for the claim "was noted by many top-scoring systems to be essential". Top system
TUDA_MAI scored 0.63 AVeriTeC score vs an 0.11 baseline; 18 of 21 submissions beat baseline.
HerO (2nd, 0.57) additionally expanded queries by having an LLM write a *hypothetical document*
that would settle the claim, then retrieving against that (HyDE-style).
Sources: https://arxiv.org/html/2410.23850v1 · https://arxiv.org/abs/2410.12377

**5. Use AVeriTeC's four-label taxonomy, not True/False/Unverified.**
Labels: **Supported**, **Refuted**, **Conflicting Evidence/Cherrypicking**, **Not Enough
Evidence**. The C label covers claims that are technically true but mislead by excluding
important context — exactly the "misleading / missing context" case. Note the distinction the
paper insists on: C means contradictory evidence exists; N means no usable evidence was found.
Real label distribution in their test set: 25.5% S, 62.0% R, 6.3% C, 6.2% N (skewed to Refuted
because journalists select suspicious claims).
Caveat from the shared task overview: systems "struggled with rarer verdict categories
(conflicting evidence, not enough evidence)" — so expect your C/N recall to be poor and do not
oversell it in the demo.
Sources: https://arxiv.org/html/2305.13117v3 · https://arxiv.org/html/2410.23850v1

**6. Ground every citation in tool output. Never let the synthesis model emit a URL.**
Liu, Zhang & Liang audited four production generative search engines: only **51.5%** of
generated sentences were fully supported by their citations, and only **74.5%** of citations
actually supported the sentence they were attached to. This is the headline failure mode of the
whole product category.
→ Architecture rule: the synthesis stage receives an array of `{id, url, title, quoted_span}`
objects built from the `web_search` tool's own `annotations`/`sources`, and its JSON schema
only lets it reference evidence by `id`. It cannot type a URL. Post-validate that every emitted
id exists.
Source: https://arxiv.org/abs/2304.09848

**7. Separate stance classification from verdict synthesis, and require a quoted span.**
FactCheck-GPT's seven-subtask breakdown treats *stance detection* as its own step between
retrieval and verdict, typically over ~5 evidence snippets per atomic claim. Keeping it separate
stops the synthesis model from laundering weak evidence into a confident verdict, and the
required quoted span is what makes the verdict explainable and auditable.
Source: https://ar5iv.labs.arxiv.org/html/2311.09000

**8. Strict structured outputs on every stage.** Responses API:
`text: { format: { type: "json_schema", name: "...", schema: {...}, strict: true } }`, with
`additionalProperties: false` and every property in `required`. Optional fields are emulated
with a nullable union (`"type": ["string", "null"]`). Refusals come back in a `refusal` field
rather than as a parse error — handle it.
Source: https://developers.openai.com/api/docs/guides/structured-outputs

**9. Cap the per-claim search loop at 2 rounds with an explicit sufficiency check.**
SAFE's loop is: generate a query from the fact plus prior results → reason over results →
repeat "after a set number of steps". The published evidence on the *right* number is thin, but
what exists points the same way: an iterative-retrieval analysis reports that extending beyond
two rounds gives "only diminishing returns", and training-free adaptive-stopping work (TASR)
fires as soon as the model repeats its previous-round answer. Honest summary: **the literature
agrees more rounds stop helping quickly, and disagrees on the exact cutoff.**
→ Round 1: question-driven search. Round 2 only if a sufficiency check says a specific gap
remains. Hard stop at 2. **[inference]** This also caps your latency and your web_search bill.
Sources: https://arxiv.org/html/2403.18802v3 · https://arxiv.org/pdf/2509.25530 ·
https://arxiv.org/html/2606.13814v1

### high-value

**10. Build confidence as a composite, not a vibe.** See §5 — this is the recommendation with
the most actual evidence behind it and it is cheap. Ask the model for `k` candidate verdicts
each with a verbalized probability, then multiply/blend with evidence-side signals (independent
source count, agreement ratio, source tier). Do not ship the raw single verbalized number.

**11. Penalise correlated evidence explicitly.** RAMDocs shows RAG baselines have a frequency
bias: "as the imbalance in the underlying evidence increases, the baselines have a greater
propensity to favor the answer with more supporting documents" — regardless of correctness.
Twenty outlets running one wire story will read as overwhelming corroboration unless you stop
it.
→ Dedupe by registered domain before counting; count *distinct domains*, not documents; and
**[inference]** flag near-duplicate text (shared 8-gram overlap, or a cheap embedding-similarity
check with `text-embedding-3-small`) as one source, not many.
Source: https://arxiv.org/html/2504.13079v2

**12. Treat fact-check sites as a separate evidence class, not as evidence.**
The CREDULE work classifies retrieved articles as **Credible / Unreliable / Fact-checked
(leaked)**, where "leaked" means the evidence came from a fact-checking site that already
adjudicated the same claim. They audited LIAR-PLUS, MOCHEG, FACTIFY, NewsCLIPpings+ and VERITE
and found "concerning rates of leaked and unreliable evidence". Their evidence-filtering net
reached 91.5–94.4% accuracy using domain credibility scores.
→ Pulling the Snopes page is not verification, it is lookup. It is also *great demo material*
if you label it honestly as "an existing fact-check exists" in a separate UI slot.
Source: https://arxiv.org/abs/2404.18971

**13. Pass source credibility into the synthesis prompt as plain text.**
The CONFACT study found that telling the model about source quality at the *answer-generation*
stage (as background text, with CoT) gave up to ~10% absolute F1 gains on conflicting evidence
— while credibility-aware *re-ranking* sometimes made things worse. Also relevant to your UI:
human annotators rated 95.8% of mainstream news sources credible while expert review flagged
30% as unreliable.
→ A hardcoded 30–50 entry domain-tier map (wire services / major outlets / gov+academic /
partisan / unknown) is a ~20-minute job and is the highest-leverage prompt content you'll add.
Source: https://arxiv.org/html/2505.17762v1

**14. For images, reverse image search is the whole game — and it's an API call.**
See §6. Google Cloud Vision `WEB_DETECTION` returns `webEntities`, `fullMatchingImages`,
`partialMatchingImages`, `pagesWithMatchingImages` (with page URL + title), `visuallySimilarImages`
and `bestGuessLabels` from `POST https://vision.googleapis.com/v1/images:annotate`.
The earliest date among `pagesWithMatchingImages` is your out-of-context signal.
Source: https://docs.cloud.google.com/vision/docs/detecting-web

**15. Show the "without evidence" verdict alongside the evidence-grounded one.**
ClashEval (NeurIPS 2024 D&B) found LLMs override their own *correct* prior with incorrect
retrieved content over 60% of the time, and that the effect scales with how confident the prior
was and how far the context deviates. Running one cheap no-search pass and displaying both
verdicts is a two-line change that makes the "is this grounded or is it memory?" question
visible to a judge.
Source: https://proceedings.neurips.cc/paper_files/paper/2024/file/3aa291abc426d7a29fb08418c1244177-Paper-Datasets_and_Benchmarks_Track.pdf

### skip for 36h

- **Any fine-tuned component.** A trained NLI cross-encoder, a trained OOC detector (CCN,
  SNIFFER), a trained calibrator. Flagged explicitly because for confidence calibration a
  trained calibrator *is* the right answer (see §5) and you are excluding it purely for
  time/dataset reasons.
- **Multi-agent debate (MADAM-RAG).** Real gains (+11.4% AmbigDocs, +15.8% FaithEval) but it is
  one LLM agent per document plus multi-round debate. Cost and latency killer for a live demo.
  https://arxiv.org/html/2504.13079v2
- **Hungarian-METEOR / AVeriTeC eval harness.** Only worth it if you're reporting a benchmark
  number. You aren't.
- **Self-consistency sampling over the whole pipeline.** N× cost for a calibration gain the
  literature doesn't agree on (§5).
- **Building your own search index or crawler.** The hosted `web_search` tool exists.

---

## 2. Claim decomposition

**The finding that matters:** decomposition is not monotonically good. "Decomposition Dilemmas"
(NAACL 2025) is the only paper I found that isolates this, and it reports a genuine trade-off —
"increasing the number of sub-claims may initially enhance performance, additional noise
introduced will gradually offset these gains, eventually leading to performance degradation."
Their error taxonomy is directly usable as a reflection-step checklist:

| Error | What it looks like |
|---|---|
| Omission of context | A sub-claim drops the logical relation that made the original checkable |
| Ambiguity | Unresolved pronouns, vague references, underspecified entities |
| Over-decomposition | Fragmentation into redundant or trivially-true pieces |
| Alteration of meaning | The decomposition fabricates or contradicts the source |

Omission and over-decomposition were the most prevalent. Their other finding is worth noting for
model selection: **stronger verifiers benefit less from decomposition, weaker ones benefit more.**
**[inference]** With a current frontier model as your verifier you are on the "decompose less"
side of that curve. Source: https://arxiv.org/html/2411.02400v1

**Why over-fine decomposition breaks things, mechanically:** Molecular Facts documents that
atomic units lose entity disambiguation and get matched against evidence about a same-named
different entity. Their fix is minimal decontextualization, and they measure the opposite
failure too: 1.7–9.6% of decontextualizations added *non-minimal* information that caused error
localization problems. Both directions hurt. https://arxiv.org/html/2406.20079

**The published decomposition pipelines, for reference:**

- **SAFE** (DeepMind, "Long-form factuality in LLMs"): split response into individual facts →
  revise each to be self-contained → check relevance to the prompt → rate supported / not
  supported via iterated Google search. Irrelevant facts are dropped from the metric entirely.
  72% agreement with crowdworkers on ~16k facts; on 100 disagreements SAFE was right 76% of the
  time vs humans 19%. $0.19 per response vs $4 human, >20× cheaper.
  https://arxiv.org/html/2403.18802v3
- **FactScore**: percentage of atomic facts supported by a reliable knowledge source; automated
  estimator within 2% of human. Motivated the whole decompose-then-verify paradigm.
  https://arxiv.org/abs/2305.14251
- **AVeriTeC**: decomposes into **question–answer pairs** rather than sub-claims — ~2.6 QA pairs
  per claim, each answer citing a URL (53% extractive, 26% abstractive, 17% boolean). This is the
  decomposition granularity I'd copy: it is coarse enough to keep context and it doubles as your
  retrieval plan and your explanation. https://arxiv.org/html/2305.13117v3
- **FactCheck-GPT**: seven subtasks — decomposition, decontextualisation, checkworthiness,
  evidence retrieval, stance detection, correction determination, claim correction.
  The **checkworthiness** filter is worth stealing: not every extracted sentence is a factual
  claim. https://ar5iv.labs.arxiv.org/html/2311.09000

**Concrete recommendation:** claim extraction stage emits, per claim,
`{ text (molecular/decontextualized), checkworthy: bool, questions: string[2..4] }`, then a
reflection call that returns the same array corrected against the four error types above.
Two calls, one schema.

---

## 3. Evidence retrieval and query generation

**Query generation.** The AVeriTeC organizers' conclusion is the cleanest primary-source
statement available: generating questions beats searching the claim, and this was reported
independently by many top systems. Multi-hop retrieval — successive rounds each conditioned on
the last round's findings — also improved results. Top systems used dense retrievers from the
`gte` family with BM25 hybrid reranking. https://arxiv.org/html/2410.23850v1

HerO's specific trick: use an LLM to generate a *hypothetical document* that would verify the
claim and retrieve against that instead of the raw claim. HerO got the best Q and Q+A retrieval
scores of the top 3 systems. https://arxiv.org/abs/2410.12377
**[inference]** With the hosted `web_search` tool you don't control the retriever, so the
transferable part is the *query text*: feed it your generated questions one at a time, not the
claim. You lose the reranking layer entirely — accept that.

**How many rounds.** Weak evidence, consistent direction. SAFE iterates "a set number of steps"
without justifying the number (https://arxiv.org/html/2403.18802v3). A GraphRAG iterative-retrieval
analysis reports two rounds as the best cost/benefit point with three or more giving
"only diminishing returns" (https://arxiv.org/pdf/2509.25530). TASR stops when the model repeats
its previous-round answer and a calibrated margin clears a threshold
(https://arxiv.org/html/2606.13814v1). None of these is a fact-checking-specific ablation. **I
would not claim a principled number in your writeup — say you capped at 2 for latency.**

**Stopping on sufficiency.** The usable pattern across these papers: after each round ask the
model, in a strict schema, *what specific fact is still missing*; if it returns null, stop. This
is better than a fixed loop because the "what's missing" string becomes the next query and, if
you never satisfy it, becomes your justification for the **Not Enough Evidence** label.
**[inference]** — the pattern is assembled from the above sources, no single paper prescribes it.

**Bottleneck.** Shared-task human evaluation found ~36% of predictions scored poorly on semantic
coverage against reference evidence, and that automatic METEOR misaligns with human judgement of
evidence quality. Retrieval coverage, not the verdict classifier, is where AVeriTeC systems lose.
https://arxiv.org/html/2410.23850v1

---

## 4. Stance / entailment classification

**Documented failure modes, with sources:**

- **Lexical-overlap shortcut.** NLI-style verifiers latch onto surface similarity rather than
  entailment. VitaminC (NAACL 2021) built 400k+ claim–evidence pairs from 100k+ Wikipedia
  revisions where an evidence pair is "nearly identical in language and content, with the
  exception that one supports a given claim while the other does not." Models fail these.
  Training on it gave +10% on adversarial fact verification, +6% on adversarial NLI.
  → The failure this names is exactly "topically relevant but logically irrelevant".
  https://arxiv.org/abs/2103.08541
- **Numbers, dates, quantifiers, negation** are where meaning flips with minimal surface change —
  the VitaminC construction is built on precisely these edits. https://arxiv.org/abs/2103.08541
- **Adversarial retrieval distraction.** FEVER 2.0 extended adversarial evaluation to the
  retrieval component, letting attackers "distract with related — but distinct — information."
  https://arxiv.org/html/1903.05543
- **Planted evidence.** "Attacks by Content" frames automated fact-checking as an AI *security*
  problem: an adversary who can get content indexed can steer what your retriever finds and
  therefore what you cite. https://arxiv.org/pdf/2510.11238

**What to do about it in 24 hours** (no trained NLI model available):

Classify each retrieved snippet independently, in a strict schema, with fields that make the
shortcut hard to take:
```
{ evidence_id, quoted_span, addresses_claim: bool, stance: "supports"|"refutes"|"neutral",
  why: string, reversing_detail: string|null }
```
`addresses_claim` is a separate gate from `stance` — this is the direct mitigation for
topically-relevant-but-irrelevant, forcing a second decision instead of letting relevance leak
into stance. `reversing_detail` prompts explicitly for a number/date/quantifier/negation mismatch.
**[inference]** — this schema is my design, motivated by the VitaminC and FEVER 2.0 findings above.

Note ALCE's evaluation method as a cheap self-check if you have spare time: it uses an NLI model
to test whether cited passages entail the generated text, and reports 85.1% citation recall /
77.6% citation precision detection quality. https://arxiv.org/pdf/2305.14627

---

## 5. Verdict aggregation and confidence calibration

### Label set
Use AVeriTeC's four (§1.5). Reasons, restated: the benchmark was built from 4,568 real claims
across 50 fact-checking organisations with κ=0.619 inter-annotator agreement on verdicts, so the
taxonomy is empirically grounded in what human fact-checkers actually need; and its C label is
the only one of the standard sets that captures cherry-picking / missing context.
https://arxiv.org/html/2305.13117v3

Be honest in the writeup that C and N are the categories systems do worst on
(https://arxiv.org/html/2410.23850v1).

### Is verbalized LLM confidence calibrated?

**Partly, and better than the alternatives available to you.** This is the clearest primary-source
answer:

- Tian et al. (EMNLP 2023), "Just Ask for Calibration": for RLHF-tuned models, *verbalized
  confidences emitted as output tokens are typically better calibrated than the model's
  conditional probabilities*, reducing ECE by ~50% relative. Best method was **Verb. 1S top-k**
  — ask for k candidate answers each with its own probability, in one shot. GPT-4 numbers:
  TriviaQA ECE 0.025 / AUC 0.959; **TruthfulQA ECE 0.198 / AUC 0.619**.
  https://ar5iv.labs.arxiv.org/html/2305.14975 · https://aclanthology.org/2023.emnlp-main.330/
- **Read that TruthfulQA row carefully.** On adversarial, commonly-believed-falsehood content —
  which is what your product ingests — calibration collapses to near-useless (AUC 0.619 means
  barely better than coin-flip at ranking right vs wrong). Generalising the TriviaQA number to
  fact-checking would be wrong.
- Xiong et al., "Can LLMs Express Their Uncertainty?": verbalized confidence is *overconfident*,
  "potentially imitating human patterns"; human-inspired prompts, consistency across samples and
  better aggregation each help, but "none of these techniques consistently outperform others."
  https://arxiv.org/abs/2306.13063

**Conclusion: do not ship a bare verbalized number.** Do use the Verb. 1S top-k *form* — asking
for alternative verdicts with probabilities is what makes the elicitation work.

### The composite you should actually ship

R2VC (recent arXiv, treat as suggestive not settled) builds exactly this and reports Brier 0.083
vs 0.192 uncalibrated and ECE 0.0125 vs 0.0361 on FEVER. Its signals:
max entailment support (w 0.6), evidence coverage (0.2), contradiction penalty (−0.3),
generator/NLI label consistency (0.1), citation alignment (0.1); plus meta-features
(agreement fraction across candidates, passage count, citation validity); fed to a logistic
regression trained on 10k held-out VitaminC examples, with two-stage abstention to "Uncertain"
below thresholds. https://arxiv.org/html/2609.11955

**The trained logistic regression is out of scope for you — no labelled data, no time.** That is
the excluded-for-time-reasons case flagged up front. But the *feature set* and the *abstention
gate* are free. Hand-weight it:

```ts
// [inference] — hand-weighted analogue of R2VC's learned combiner. Weights are a guess,
// not a measured fit. Expose them in one config object so they can be tuned by eye in the demo.
confidence =
    0.35 * verbalizedTopKProbabilityOfWinningVerdict   // Tian et al.
  + 0.25 * agreementRatio        // (stance-aligned distinct domains) / (distinct domains)
  + 0.20 * sourceQualityScore    // domain tier map, 0..1
  + 0.20 * min(independentDomains / 3, 1)              // saturates at 3 distinct domains
// then: if no independent domain has stance != neutral -> label = Not Enough Evidence,
//       regardless of the number above.
```
The abstention override matters more than the weights: R2VC's ablation shows removing
calibration nearly doubles Brier, and the mechanism that does the work is refusing to answer
when the evidence side is thin. https://arxiv.org/html/2609.11955

**Counting rule for `independentDomains`:** distinct registered domains after near-duplicate
text collapse (§1.11), with fact-check-site hits excluded from the count (§1.12).

### Cache TTL

Your design keys cache on the canonical claim with confidence-varying TTL. **[inference]** Add a
second axis: claims whose evidence includes anything dated within the last 7 days get a short
TTL regardless of confidence, and **Not Enough Evidence** verdicts get the shortest TTL of all,
since N is the label most likely to flip as coverage appears. No source — this is just the
obvious shape.

---

## 6. Multimodal / out-of-context images

**What the evidence says works, in order:**

1. **XFacta (2025)** is the most decision-relevant paper here because it evaluates exactly your
   architecture — an MLLM plus web search — on contemporary real claims. GPT-4o dev-set numbers:
   **70.8% no evidence → 87.1% with text search → 77.9% with reverse image search → ~88.3% with
   both plus domain filtering.** Best test-set result 88.6% (GPT-4o), vs Gemini-2.0-flash 78.9%.
   Their nuance is important: text search scores highest overall but fails on the
   out-of-context case specifically, because "strong support for T in Et misleads the model" —
   the caption's *claim* is well-supported somewhere, just not about this image. They conclude
   image→evidence "remains the optimal evidence retrieval strategy across various misinformation
   types." https://arxiv.org/html/2508.09999v1
   → **Run both. Route the OOC decision off the image search, not the text search.**
2. **NewsCLIPpings is saturated.** Same paper: GPT-4o reaches 0.8–0.9 accuracy on older datasets
   *with no evidence at all*, i.e. by memorisation, vs 70.5% on XFacta. Do not quote
   NewsCLIPpings numbers as evidence your approach works.
   https://arxiv.org/html/2508.09999v1
3. **CCN** (ECCV 2022) is the origin of the evidence-based approach: multi-modal
   cycle-consistency — reverse image search (Google Vision) to get textual evidence about the
   image, caption-text search to get visual evidence, then compare each against the *other*
   modality. 84.7% on NewsCLIPpings vs 66.1% for a CLIP-only baseline (+18.7pp from evidence).
   Ablation: removing evidence *images* cost the most (down to 57.4%), removing evidence captions
   down to 71.8%, removing entities ~71.8%. https://ar5iv.labs.arxiv.org/html/2112.00061
   → Trained model, so **skip the model** — but the cycle-consistency *framing* is a good prompt
   structure and the ablation tells you visual evidence carries the signal.
4. **SNIFFER** — instruction-tuned InstructBLIP/Vicuna-13B for explainable OOC detection. Skip:
   requires training, and you have no non-OpenAI models. https://arxiv.org/abs/2403.03170
5. **MLLMs with no evidence at all**: GPT-4V can identify misleading multimodal claims and
   explain "the unreasonable aspects and underlying motives", but open-source models show
   "strong biases and are highly sensitive to the prompt". Evidence-free judgement is a
   fallback, not a method. https://arxiv.org/pdf/2403.03627

**The 36h build for images:**
- Vision input via Responses API `input_image` (`image_url` accepts a
  `data:image/png;base64,...` URL, or `file_id` from the Files API; `detail`: `low`/`high`/
  `original`/`auto`). https://developers.openai.com/api/docs/guides/images-vision
- One model call: describe the image, extract any embedded text, and list the *entities, place
  and apparent date* it depicts. Those become search queries.
- One Cloud Vision `WEB_DETECTION` call for the reverse search. Use `pagesWithMatchingImages`
  (page URL + title) and `bestGuessLabels`. https://docs.cloud.google.com/vision/docs/detecting-web
- **The OOC signal that actually works and needs no model:** the earliest page carrying this
  image predates the event the caption describes, or describes a different event/place. That is
  a date comparison and a string comparison, and it is the entire feature.
  **[inference]** — the signal is what CCN and XFacta operationalise with trained models; reducing
  it to earliest-match-date is my simplification, and it will miss cropped/re-encoded reposts that
  only appear in `partialMatchingImages`.
- **[unverified]** The `web_search` tool advertises `search_content_types: ["image", "text"]`.
  That is a text-query → image-results search, *not* reverse image search, so it does not replace
  Cloud Vision. Worth 10 minutes of testing; do not design around it.
  https://developers.openai.com/api/docs/guides/tools-web-search

---

## 7. Known failure modes and mitigations

| Failure | Primary source | Mitigation you can build today |
|---|---|---|
| Citation hallucination / citation-text mismatch | 51.5% of sentences fully supported, 74.5% of citations support their sentence — https://arxiv.org/abs/2304.09848 | Synthesis model references evidence by `id` only; URLs come from tool `annotations`; post-validate ids and reject the response otherwise |
| Echo chamber — N outlets, one wire story | Frequency bias in RAG: models favour the answer with more supporting documents as imbalance grows — https://arxiv.org/html/2504.13079v2 | Count distinct registered domains after near-duplicate collapse; agreement ratio over domains, not documents |
| Fact-check leakage masquerading as evidence | Credible / Unreliable / **Fact-checked (leaked)** classes; leaked+unreliable evidence found at "concerning rates" in LIAR-PLUS, MOCHEG, FACTIFY, NewsCLIPpings+, VERITE — https://arxiv.org/abs/2404.18971 | Domain list of fact-check sites; surface separately as "an existing fact-check exists", exclude from independent-source count |
| Parametric memory overriding evidence | LLMs adopt incorrect retrieved content over their correct prior >60% of the time; effect scales with prior confidence and context deviation — https://proceedings.neurips.cc/paper_files/paper/2024/file/3aa291abc426d7a29fb08418c1244177-Paper-Datasets_and_Benchmarks_Track.pdf | Require a `quoted_span` for every stance judgement; run and display the no-evidence verdict alongside |
| Evidence pool poisoned by LLM-generated misinformation | LLMs are effective misinformation generators and degrade ODQA significantly; defences tried were prompting, misinformation detection, majority voting — https://arxiv.org/abs/2305.13661 | Source tiering; require corroboration from ≥2 independent domains before Supported/Refuted at high confidence |
| Deliberate content planting to steer retrieval | Automated fact-checking framed as an AI security issue — https://arxiv.org/pdf/2510.11238 | Same as above; plus `filters.allowed_domains` on `web_search` for a "high-trust mode" toggle |
| Conflicting evidence handled as if all sources are equal | Baselines treat all documents as equally valid; injecting source credibility at generation time gave ~10% absolute F1 — https://arxiv.org/html/2505.17762v1 | Domain tier map rendered into the synthesis prompt as text |
| Over-decomposition noise | https://arxiv.org/html/2411.02400v1 | Sub-claim cap + reflection pass |
| Topically relevant but non-entailing evidence | https://arxiv.org/abs/2103.08541 · https://arxiv.org/html/1903.05543 | Separate `addresses_claim` gate before `stance` |

---

## 8. OpenAI API specifics

Verified against `developers.openai.com` on 2026-09-23. **Note `platform.openai.com/docs/*` now
301-redirects to `developers.openai.com/api/docs/*`.** Model IDs and API surfaces churn — re-check
before you build, and call `GET /v1/models` to see what your key actually has.

### Hosted web search (Responses API)
Source: https://developers.openai.com/api/docs/guides/tools-web-search ·
https://developers.openai.com/api/docs/api-reference/responses/create

- Enable with `{ "type": "web_search" }` in `tools`. A dated variant `web_search_2025_08_26` also
  exists. The docs state: "For new Responses API integrations, use `{ "type": "web_search" }`".
- Output items you get back:
  - `web_search_call` — has `id`, `status`, and `action`, where the action type is one of
    `search`, `open_page`, `find_in_page`.
  - `message` — the text in `message.content[0].text`, citations in
    `message.content[0].annotations`.
- `url_citation` annotation fields: `type: "url_citation"`, `start_index`, `end_index`, `url`,
  `title`.
- **`sources`** returns the complete list of URLs the model consulted, which is larger than the
  inline citation set. **This is the field you build your evidence array from** — inline
  annotations only show the top references.
- Config keys: `search_context_size` (`low`|`medium`|`high`); `user_location`
  (`{type:"approximate", country, city, region, timezone}`); `filters.allowed_domains` /
  `blocked_domains`, up to 100 entries, bare domains with no scheme;
  `external_web_access` (bool, live vs cached); `search_content_types` (`["image","text"]`);
  `return_token_budget` (`default`|`unlimited`, for long research runs on reasoning models).
- **Pricing: $10.00 / 1k calls, plus search content tokens billed at model rates.**
  https://developers.openai.com/api/docs/pricing
  → **[inference] This is the number that should drive your architecture.** At 3 claims × 2 rounds
  you are at ~6 searches ≈ $0.06 per verification before tokens. Your verdict cache is not a
  nice-to-have, it is the cost control. Cache aggressively and pre-warm the demo claims.

### Structured outputs
Source: https://developers.openai.com/api/docs/guides/structured-outputs
- `text: { format: { type: "json_schema", name: "...", schema: {...}, strict: true } }`
- `additionalProperties: false` required; all properties must be in `required`; optionality is
  expressed as a nullable union, e.g. `{"type": ["string","null"]}`.
- Supported: `type`, `properties`, `required`, `enum`, arrays with `items`, `anyOf`/`allOf`/
  `oneOf` (with limits), `$ref` for recursion, `description`/`title`.
- `refusal` field returned instead of schema-conforming output on safety refusals — handle it.
- **[unverified]** The docs reference a "Supported schemas" section for exact numeric limits
  (max properties, nesting depth, enum count, total string length) that I could not retrieve.
  Community sources cite 100 properties / 5 nesting levels / 500 total enum values, but these are
  secondary and likely stale. **Check
  https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas before
  designing a deep schema** — and keep schemas shallow anyway, which you want for reliability.

### Vision input
Source: https://developers.openai.com/api/docs/guides/images-vision
- Content part type `input_image`, carrying either `image_url` (fully-qualified URL *or*
  `data:image/<type>;base64,<data>`) or `file_id` (Files API, `purpose: "vision"`).
- `detail`: `low` | `high` | `original` | `auto` (default; `original` preserves dimensions for
  detail-sensitive work).
- Limits: up to 512 MB total payload per request, up to 1,500 images per request.
  PNG, JPEG, WEBP, non-animated GIF.

### Model IDs
Source: https://developers.openai.com/api/docs/models · https://developers.openai.com/api/docs/pricing
(Both pages fetched 2026-09-23 and agreeing; `developers.openai.com/api/docs/guides/models` 404s.)

| ID | Notes | $/1M in | cached in | $/1M out |
|---|---|---|---|---|
| `gpt-6-astra` | "most capable… hardest end-to-end work", 1.05M ctx, vision + web search + structured outputs | 10.00 | 1.00 | 50.00 |
| `gpt-6-sol` | coding/agentic workflows, 1.05M ctx, same tool support | 2.00 | 0.20 | 10.00 |
| `gpt-6-luna` | "most efficient… focused, high-volume", 1.05M ctx, same tool support | 0.10 | 0.01 | 0.50 |
| `gpt-5.6-sol` | prior generation | 4.00 | 0.40 | 20.00 |
| `gpt-5.5` | prior generation, vision + web search | 5.00 | 0.50 | 30.00 |
| `gpt-5.4` | prior generation | 2.50 | 0.25 | 15.00 |
| `gpt-4o` | legacy, still listed | 2.50 | 1.25 | 10.00 |
| `text-embedding-3-small` | for near-duplicate evidence detection | 0.02 | — | — |

All three gpt-6 models list a 128K max output.
Reasoning effort levels seen in the web-search docs include `low`, `high`, `xhigh`.

**[inference] Model routing for your pipeline**, given those prices:
- claim extraction + reflection + per-snippet stance → `gpt-6-luna` (0.10/0.50 is ~100× cheaper
  than astra; these are short structured tasks)
- verdict synthesis + the agentic search loop → `gpt-6-sol` (tool-use oriented, 5× cheaper than astra)
- image understanding → `gpt-6-sol`, escalate to `gpt-6-astra` only if quality is visibly short
- Reserve `gpt-6-astra` for the demo's showcase path, not the whole pipeline.

---

## 9. Where the evidence is thin

Stated plainly so nobody over-claims in the pitch:

- **Optimal search iteration count.** No fact-checking-specific ablation found. The "2 rounds"
  figure comes from a GraphRAG paper. Treat as engineering judgement, not a finding.
- **Verbalized confidence on adversarial content.** Tian et al.'s good numbers are TriviaQA;
  TruthfulQA AUC 0.619 is much closer to your actual input distribution. Nobody has published a
  calibration study on open-web fact-checking with a current frontier model, as far as I found.
- **Whether the composite confidence formula in §5 helps.** R2VC shows a *learned* combiner helps
  a lot. A hand-weighted one is an untested approximation. It is still better than a bare
  verbalized number, because the abstention gate does the real work.
- **Source credibility scoring.** CONFACT shows credibility info at generation time helps but
  credibility-aware *reranking* can hurt. Applying credibility at the wrong stage is a live risk.
- **Two 2026 arXiv preprints cited here** (R2VC 2609.11955, TASR 2606.13814) are recent and I have
  no evidence of peer review. Weighted accordingly.
- **Decomposition Dilemmas' reflection gains** are enormous (24.91 → 67.70 F1) on one dataset and
  tiny (48.03 → 48.32) on another. The mean effect is likely much smaller than the headline.

---

## Source index

Decomposition — https://arxiv.org/html/2411.02400v1 · https://arxiv.org/html/2406.20079 ·
https://arxiv.org/abs/2305.14251 · https://arxiv.org/html/2403.18802v3 ·
https://ar5iv.labs.arxiv.org/html/2311.09000
Benchmarks & taxonomy — https://arxiv.org/html/2305.13117v3 · https://arxiv.org/html/2410.23850v1 ·
https://arxiv.org/abs/2410.12377 · https://arxiv.org/abs/2103.08541 · https://arxiv.org/html/1903.05543
Retrieval & stopping — https://arxiv.org/pdf/2509.25530 · https://arxiv.org/html/2606.13814v1
Calibration — https://ar5iv.labs.arxiv.org/html/2305.14975 · https://aclanthology.org/2023.emnlp-main.330/ ·
https://arxiv.org/abs/2306.13063 · https://arxiv.org/html/2609.11955
Conflict & credibility — https://arxiv.org/html/2504.13079v2 · https://arxiv.org/html/2505.17762v1 ·
https://arxiv.org/abs/2404.18971 ·
https://proceedings.neurips.cc/paper_files/paper/2024/file/3aa291abc426d7a29fb08418c1244177-Paper-Datasets_and_Benchmarks_Track.pdf
Citations & attacks — https://arxiv.org/abs/2304.09848 · https://arxiv.org/pdf/2305.14627 ·
https://arxiv.org/abs/2305.13661 · https://arxiv.org/pdf/2510.11238
Multimodal — https://arxiv.org/html/2508.09999v1 · https://ar5iv.labs.arxiv.org/html/2112.00061 ·
https://arxiv.org/abs/2403.03170 · https://arxiv.org/pdf/2403.03627 ·
https://docs.cloud.google.com/vision/docs/detecting-web
OpenAI docs — https://developers.openai.com/api/docs/guides/tools-web-search ·
https://developers.openai.com/api/docs/guides/structured-outputs ·
https://developers.openai.com/api/docs/guides/images-vision ·
https://developers.openai.com/api/docs/models · https://developers.openai.com/api/docs/pricing ·
https://developers.openai.com/api/docs/api-reference/responses/create
