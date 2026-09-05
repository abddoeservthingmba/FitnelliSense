# Gates

The eval harness scores every gate on every run and writes the result to
`evals/report.json`. **Loop A picks the single highest-severity failing gate each
iteration**, so these definitions have to be precise enough that "which gate is
worst" is never a judgement call.

Each gate declares `blocks` — the pipeline stages that cannot be trusted while it
is red. That field is the documented tie-break: on equal severity, work the gate
blocking the most downstream stages.

A gate is one of:

- **green** — target met
- **red** — target not met
- **blocked** — cannot be evaluated yet because an upstream stage is missing.
  Distinct from red on purpose. A gate that never ran is not evidence of
  anything, and reporting it as a failure invites tuning against noise.

---

## Severity ladder

| Severity | Meaning |
|---|---|
| `critical` | Ships a wrong answer to a user, or makes results unreproducible. Never trade these away. |
| `high` | Core measurement is wrong; downstream numbers inherit the error. |
| `medium` | Quality of result degraded but not misleading. |
| `low` | Cost and comfort. Slow, noisy, or awkward — not incorrect. |

---

## The gates

### G1 · `rep_count_exact` — severity `high`

**Target:** 15/15 golden clips match the labelled rep count exactly.
**Measured:** `result.set.rep_count == clip.true_rep_count`, over clips whose
`expected_status` is `ok`. Clips expected to abstain are excluded from the
denominator and asserted separately by G6.
**Blocks:** kinematics, rules, scoring, coaching — every per-rep number is
indexed by rep, so a miscount corrupts all of them.

Exact match, not tolerance. A set of 5 reported as 4 is not 80% right; it is a
different set, and the athlete will not trust the rest of the screen.

### G2 · `depth_verdict_agreement` — severity `high`

**Target:** ≥ 95% of labelled reps agree with the human depth verdict.
**Measured:** per rep, the boolean `squat_depth_insufficient` tripped vs
`clip.reps[i].depth_ok == false`. Agreement = matching / total labelled reps.
**Blocks:** the depth score component, and the squat rule set's credibility.

### G3 · `phase_boundary_error` — severity `medium`

**Target:** median absolute error ≤ 3 frames against labelled boundaries.
**Measured:** for every labelled rep, |predicted − labelled| at each of the four
boundaries (eccentric start, bottom start, concentric start, lockout start);
median over all boundaries of all reps.
**Measured on:** **synthetic clips only** — see the note below.
**Blocks:** tempo scoring, `dropped_eccentric`, velocity metrics.

Median, not mean: one unanalyzable rep should not swamp the statistic, and the
tail is already covered by G1 and G9.

**This gate's evidence is narrower than the others' and that is stated rather
than glossed.** A boundary label is four frame indices per rep, placed by hand
by scrubbing video — roughly 200 judgements for the twelve real clips, each
with its own error of a frame or two. Measuring a 3-frame target against labels
carrying 1–2 frames of human error is measuring the labeller as much as the
pipeline.

The synthetic clips have boundaries that are exact by construction, so G3 is
scored on them alone unless someone volunteers to label real footage. The
consequence is honest and worth holding in mind: **G3 green means the
segmentation maths is right, not that it survives real video.** G1 on real
clips is what covers the second question, which is part of why rep count is
scored `exact` rather than with a tolerance.

### G4 · `unsafe_rule_recall` — severity `critical`

**Target:** ≥ 0.90 recall on rules with severity `unsafe`.
**Measured:** over labelled faults of severity `unsafe`,
`true_positives / (true_positives + false_negatives)`.
**Blocks:** nothing technically — and it is still the highest severity here.

Recall over precision, deliberately and asymmetrically. Missing a spine that is
folding under load is the expensive error; a false alarm costs the user one
annoyed glance.

### G5 · `minor_rule_precision` — severity `medium`

**Target:** ≥ 0.80 precision on rules with severity `minor`.
**Measured:** over emitted `minor` findings,
`true_positives / (true_positives + false_positives)`.
**Blocks:** nothing. It protects trust rather than correctness.

The mirror of G4 and for the mirrored reason: nagging someone about
non-problems teaches them to ignore the app, which costs more than silence.

### G6 · `no_verdict_on_low_quality` — severity `critical`

**Target:** 0 form verdicts emitted on clips labelled `insufficient_quality`.
**Measured:** for every clip whose `expected_status` is `insufficient_quality`:
the returned `status` must match, `set.findings` must be empty, and
`quality.reason` must equal the labelled reason exactly.
**Blocks:** nothing. It is the hard rule of the whole service.

The reason string is checked, not just the status. "We could not read this" is
only actionable if it says *why*, and a pipeline that abstains for the wrong
reason will send the user to re-shoot the wrong thing.

### G7 · `determinism` — severity `critical`

**Target:** two consecutive runs produce byte-identical JSON, `runtime_ms`
excluded.
**Measured:** run every clip twice in one process, drop
`diagnostics.runtime_ms`, compare canonical JSON.
**Blocks:** every threshold decision in Loop C. A tuning curve built on a
non-deterministic measurement is fitted to noise.

Runs in **every** iteration, not only when something touching randomness
changed. Non-determinism arrives through the back door — an unseeded library, a
dict ordering, a thread pool — and is cheapest to catch the day it appears.

### G8 · `runtime_p95` — severity `low`

**Target:** ≤ 45 s p95 for a 30 s 1080p clip on CPU.
**Measured:** p95 of `diagnostics.runtime_ms` over clips normalised to 30 s of
1080p footage.
**Blocks:** nothing. Recorded from iteration 1 so a regression is visible, but
never optimised before the numbers are correct.

### G9 · `no_unhandled_exceptions` — severity `critical`

**Target:** 0 unhandled exceptions across all fixtures.
**Measured:** the harness catches everything the analyzer lets escape. A clip
that raises is a red gate; a clip that returns `insufficient_quality` is not.
**Blocks:** everything. An analyzer that crashes on real footage has no
measurable quality at all.

### G10 · `no_magic_numbers` — severity `high`

**Target:** 0 float literals in rule modules.
**Measured:** AST scan (not regex) of `src/analyzer/rules/`, failing on any
float constant outside an allowlist of structural values (`0.0`, `1.0`, `2.0`
for halving/doubling). Every comparison value must come from `thresholds.yaml`.
**Blocks:** Loop C entirely — a threshold that is not in the file cannot be
swept, and a rule with an inline number is a rule nobody can tune or audit.

AST rather than grep because `grep` cannot tell a threshold from a version
string, and a scan with false positives gets suppressed rather than fixed.

---

## Status at scaffold time

Every gate below is `blocked`, which is the correct and expected starting state:
the harness exists, the golden set exists, and the analyzer is a stub that
returns `not_implemented`. Nothing has been measured yet, and nothing should
claim to have been.

| Gate | Severity | Target | Status |
|---|---|---|---|
| G1 `rep_count_exact` | high | 15/15 | blocked |
| G2 `depth_verdict_agreement` | high | ≥ 95% | blocked |
| G3 `phase_boundary_error` | medium | ≤ 3 frames median | blocked |
| G4 `unsafe_rule_recall` | critical | ≥ 0.90 | blocked |
| G5 `minor_rule_precision` | medium | ≥ 0.80 | blocked |
| G6 `no_verdict_on_low_quality` | critical | 0 verdicts | blocked |
| G7 `determinism` | critical | byte-identical | blocked |
| G8 `runtime_p95` | low | ≤ 45 s | blocked |
| G9 `no_unhandled_exceptions` | critical | 0 | blocked |
| G10 `no_magic_numbers` | high | 0 hits | **green** |

G10 is green already and is not a free pass: there are no rule modules yet, so
the scan passes vacuously. It is listed green rather than blocked because the
check genuinely ran and genuinely passed — the distinction matters when reading
the log six iterations from now.
