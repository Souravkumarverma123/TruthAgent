---
version: 1
slug: "app-check-id-page-tsx"
primary_target: "app/check/[id]/page.tsx"
related_targets: ["app/page.tsx"]
---

# Proof page and input page

Scope: `/check/[id]` (proof page, primary) and `/` (input page that leads to it). Mode: Operate.
Audience: hackathon judges on a projector first; older, non-technical phone users second.
Job: read the Verdict in one glance, see which side the Evidence falls on, open any quote.
Constraints: all current copy and labels stay verbatim; two-page flow stays; deck palette and Geist are binding.
Memorable moment: the Verdict reveal, a ruling over a balanced ledger.

## Direction contract

THESIS: The proof page is a ruling over a balanced ledger: one Verdict band, then For and Against as two equal columns split by a centre rule. It refuses the default single stack of same-size cards.

OWN-WORLD: White ground, ink #101714 text, evergreen #1E5B45 as the only accent, mist #EEF3F0 fields, #DDE5E1 hairline rules, one 1px centre rule dividing the ledger. Geist 700 display with tight tracking; Geist Mono only for data (E-ids, dates, tiers). Verdict red and amber live only in the ruling band and state marks.

STORY: A judge sees the Verdict word, its one-line reason and the Confidence with its reason, then which column carries weight and how many Independent sources each side has, then opens a quote or follows an E-id from the reasoning.

FIRST VIEWPORT: At 1440x900: a thin bar with the wordmark left and "Checked X ago" + Re-check right. The ruling band: Verdict word at ~96px in its colour, the one-liner at ~28px beside it, a three-step Confidence scale with its reason. The Main claim as a quoted line. The ledger headers (For / Against with counts) start above the fold.

FORM: Verdict ledger, position 1 of 7 on the ranked list, seed key 411ed602. Signature interaction: clicking an E-id in the reasoning scrolls to that Evidence row and marks it. Motion: the ruling band settles in once on load; live steps enter one by one.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
