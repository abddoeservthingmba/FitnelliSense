# Iteration log

One entry per Loop A iteration, appended, never edited. A log that gets tidied
up afterwards loses the thing it is for: the record of what was believed at the
time and how that belief turned out.

**Every entry states the hypothesis BEFORE the change**, because a hypothesis
written afterwards is a description of what happened, and it always sounds
right. The value of this file is the entries where the hypothesis was wrong.

## Format

```
## Iteration N — <gate id>

Gate targeted : <id> (severity, why it was picked over the others)
Hypothesis    : <one or two sentences, written before touching code>
Failing test  : <path::test_name — committed on its own, before the fix>
Change        : <the minimum change made>

| Gate | Before | After |
|---|---|---|
| ... | ... | ... |

Verdict : improved | no change | regressed
Notes   : what the numbers actually showed, especially if it was not the hypothesis
```

## Rules this log enforces

- A gate that regresses by more than 2% means `git revert`, and the revert is
  logged with what is now believed to have caused it. A regression traded for a
  gain is a decision that has to be made in the open, not absorbed quietly.
- Two consecutive iterations with no net gate improvement means STOP and write
  `BLOCKERS.md`. Grinding past that point is how a week disappears into a
  threshold that was never the problem.
- Eight iterations means stop regardless of state.

---

## Iteration 0 — scaffold

Not a Loop A iteration. Recorded so the starting state is on the record and the
first real iteration has something to compare against.

Built: the eval harness, `GATES.md`, the fixture loader, the golden-set
manifest, the synthetic clip generator, and an analyzer stub that raises
`NotImplementedError`.

| Gate | Status | Value |
|---|---|---|
| G1 `rep_count_exact` | blocked | — |
| G2 `depth_verdict_agreement` | blocked | — |
| G3 `phase_boundary_error` | blocked | — |
| G4 `unsafe_rule_recall` | blocked | — |
| G5 `minor_rule_precision` | blocked | — |
| G6 `no_verdict_on_low_quality` | blocked | — |
| G7 `determinism` | blocked | — |
| G8 `runtime_p95` | blocked | — |
| G9 `no_unhandled_exceptions` | blocked | — |
| G10 `no_magic_numbers` | green | 0 hits (vacuous — no rule modules yet) |

Every gate is `blocked` and that is the correct starting state: the harness runs,
the golden set parses, and the analyzer has not been written. Nothing has been
measured, so nothing claims a value.

**One thing was found and fixed during the scaffold**, worth recording because
it would have corrupted every later measurement: the synthetic clips' phase
boundaries were hand-written beside their generator config and were already
wrong. `round(0.15 * 30)` is 4, not 5 — Python rounds half to even — and S01's
fifth rep ran 30 frames past the requested `duration_s`, so it would have been
silently truncated. The labels are now derived from the same `phase_plan` the
generator draws from, and the loader rejects a synthetic clip that hand-writes
them. A wrong label on a synthetic clip does not look like a bug; it looks like
the pipeline failing, and it would have been debugged in the wrong place.

Verdict : n/a (scaffold)

## Iteration 0b — first execution

Python 3.11.9 installed; the scaffold ran for the first time. Everything above
had been written and statically validated but never executed, and that
distinction paid for itself immediately: **five defects, none of which reading
would have found.**

1. **`numpy==2.1.3` was unresolvable.** mediapipe 0.10.18 declares `numpy<2`
   and pip refused the resolve outright. The pin had been written from habit.
   Now `1.26.4`.
2. **G9 was red for the wrong reason.** The stub's `NotImplementedError` was
   counted as an unhandled exception, so the harness selected
   `no_unhandled_exceptions` as the highest-severity work — pointing the loop
   at "fix the crashes" when the real task is "write the pipeline". `Outcome`
   now separates *not implemented* from *crashed*, and G9 reports blocked
   while the pipeline is a stub. This one mattered: it would have wasted the
   first iteration.
3. **Stale clip ids in two gate messages** — `see R06` and `see R11-R13`, left
   behind when the golden set was cut from 15 real slots to 12. They pointed
   at footage that no longer exists under those names.
4. **A bug in my own test.** `zip(spans, spans[1:], strict=True)` can only ever
   raise: the second list is shorter by one by construction, which is the
   entire point of a pairwise walk. Now `itertools.pairwise`.
5. **Em-dashes rendered as `?`** in the terminal — Windows consoles default to
   cp1252. `report.json` was always UTF-8; only the human-readable output was
   affected.

Verified by running, not by reading:

| Check | Result |
|---|---|
| `pytest` | 26 passed |
| `ruff check` | all checks passed |
| Synthetic clips generated | 3, at 1080x1920 |
| Frame counts vs `phase_plan` | 480 / 427 / 156 — exact |
| Regeneration byte-identical | yes, all three (SHA-256) |
| `make eval` | runs, writes report.json, picks `next_gate` |

The regeneration check matters more than it looks: G7 compares two analyzer
runs, and if the CLIPS were not reproducible the gate would be measuring the
generator's noise rather than the pipeline's determinism.

Gate status now: **1 green, 2 red, 7 blocked.** `next_gate` is
`no_verdict_on_low_quality`, which is the correct first target — S03 must be
rejected at ingest for being 12 fps, and that is the smallest slice of pipeline
that turns any gate green.

Verdict : improved (scaffold now executes)
Notes   : `make` itself is still absent on this machine; the targets are
          invoked directly as `python -m evals.harness.*`. The Makefile is
          unverified for that reason and is the one part of the scaffold still
          taken on trust.

---

## Iteration 1 — no_verdict_on_low_quality

Gate targeted : `no_verdict_on_low_quality` (critical). Selected by the
                harness, not by eye — it was the only critical red, and
                `report.json` recorded the choice before any code was touched.
Hypothesis    : S03 is 12 fps against a 24 fps floor, but the analyzer is a
                stub that raises rather than returning a status, so the gate
                counts it as misbehaving. Implementing ingest — probe the clip,
                refuse a frame rate below the threshold — should turn G6 green
                without touching anything downstream.
Failing test  : `tests/test_ingest.py` (7 tests), committed alone in f13b5c2,
                all failing with `NotImplementedError`.
Change        : Build order step 3 only. `thresholds.py` (read the YAML,
                cached), `result.py` (one envelope builder), `ingest.py`
                (OpenCV probe + fps/duration/resolution checks), and `cli.py`
                wired to them. No pose, no calibration, no segmentation.

| Gate | Before | After |
|---|---|---|
| G1 `rep_count_exact` | red (0/2) | red (0/2) |
| G2 `depth_verdict_agreement` | blocked | **red (0/8)** |
| G3 `phase_boundary_error` | blocked | blocked |
| G4 `unsafe_rule_recall` | blocked | blocked |
| G5 `minor_rule_precision` | blocked | blocked |
| G6 `no_verdict_on_low_quality` | **red (1 clip)** | **green** |
| G7 `determinism` | blocked | **green** |
| G8 `runtime_p95` | blocked | **green (186 ms)** |
| G9 `no_unhandled_exceptions` | blocked | **green** |
| G10 `no_magic_numbers` | green | green |

Summary: 1 green / 2 red / 7 blocked → **5 green / 2 red / 3 blocked**.
No previously-green gate regressed.

Verdict : improved

Notes:

- **Three gates went green that were not the target**, and none of them was a
  freebie. G7, G8 and G9 were blocked purely because nothing had ever run;
  the moment a result came back they became measurable and passed on merit.
  Determinism in particular is now genuinely under test — two runs of each
  clip, compared byte for byte with `runtime_ms` excluded.
- **G2 went blocked → red, which is progress rather than regression.** It can
  now be evaluated and the answer is 0/8, which is correct: there is no rep
  segmentation, so no rep can agree with a depth label. Better a true red than
  an unmeasured blank.
- A clip that PASSES ingest returns `no_reps_detected`, not `ok`. Ingest really
  did succeed and nothing downstream found reps because nothing downstream
  exists. Returning `ok` with an empty set would claim an analysis happened.
- **ffprobe was specified and is not used.** ffmpeg is not installed on this
  machine, so the probe uses OpenCV's container properties. The cost is
  specific and not hidden: **rotation metadata is not checked**, so a portrait
  clip carrying a rotation flag will currently be analysed sideways, and the
  spec's `ambiguous_rotation` refusal cannot fire. This is a gap against the
  spec, not a substitution for it. It needs ffmpeg installed, or a small MP4
  atom reader, before real phone footage arrives — every clip in the golden
  set will come off a phone.
- Next gate is now `rep_count_exact` (high, blocks 4 stages), which is where
  the spec predicted most of Loop A would land.

---

## Iteration 2 — rep_count_exact

Gate targeted : `rep_count_exact` (high, blocks 4 stages)
Hypothesis    : nothing produces a vertical bar signal, so rep_count is always
                0. Per the spec, segmentation runs on BAR velocity rather than
                pose, so tracking the plate centroid per frame and filtering
                excursions by minimum ROM should give 5 on S01 and 3 on S02.
Failing test  : `tests/test_segmentation.py` (7 tests), committed alone in
                f1a0f8b, failing with `assert 0 == 5`.
Change        : Build order steps 6 and 7. `tracking.py` (Hough circles on a
                downscaled frame, plate pair by closest y, gaps interpolated
                only up to the threshold), `segmentation.py` (Savitzky-Golay,
                then excursions between turnarounds, filtered by ROM).

| Gate | Before | After |
|---|---|---|
| G1 `rep_count_exact` | red (0/2) | **green (2/2)** |
| G2 `depth_verdict_agreement` | red (0/8) | red (5/8, 62.5%) |
| G3 `phase_boundary_error` | blocked | **red (median 4.0 frames)** |
| G4 `unsafe_rule_recall` | blocked | blocked |
| G5 `minor_rule_precision` | blocked | blocked |
| G6 `no_verdict_on_low_quality` | green | green |
| G7 `determinism` | green | green |
| G8 `runtime_p95` | green (186 ms) | green (12,335 ms) |
| G9 `no_unhandled_exceptions` | green | green |
| G10 `no_magic_numbers` | green | green |

Summary: 5 green / 2 red / 3 blocked → **6 green / 2 red / 2 blocked**.
No previously-green gate regressed.

Verdict : improved

Notes:

- **S02 is the result worth having.** Three real reps and three decoys — a
  re-grip at 10% of range, a shuffle at 14%, a partial at 35% — and it counts
  3. Counting clean reps is easy; rejecting things that look like reps is the
  whole job of this stage.
- **The ROM reference needed rethinking mid-implementation.** The threshold is
  a fraction "of median rep ROM", which is circular: the median rep is what
  segmentation is trying to find. Taking the plain median of all candidates
  puts S02's cut at 0.371 against a decoy at 0.35 — technically passing, and
  a hair's breadth from failing on any real footage. The reference is now the
  median of candidates within half the largest excursion, which separates the
  rep cluster from the decoys with room to spare. The 0.5 went into
  thresholds.yaml rather than the code.
- **G2 moved 0/8 → 5/8 and that number is exactly right.** No depth rule
  exists, so nothing trips and every rep is predicted "depth ok". S01's five
  good reps agree; S02's three shallow ones do not. 5/8 is what a pipeline
  with no depth rule should score, which is a small check that the gate is
  measuring what it claims to.
- **G8 went from 186 ms to 12.3 s — a 66x slowdown, still green.** Hough runs
  on every frame. At 480 frames that is 12 s; a 900-frame 30 s clip
  extrapolates to roughly 23 s against a 45 s target. Recorded, not optimised:
  the spec says note it and move on, and correctness is not settled yet.
- G3 became measurable and is red at 4 frames against a 3-frame target. Close,
  and it is the next-but-one problem rather than this one.
