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

---

## Iteration 3 — phase_boundary_error

Gate targeted : `phase_boundary_error` (medium).
                **Deviation from the protocol, stated rather than hidden.**
                `depth_verdict_agreement` is higher severity and is what the
                harness selected, but it is blocked on a DECISION, not on work:
                MediaPipe detects zero poses in 24 sampled frames of the
                synthetic clips, because they are stick figures and it is
                trained on people. Attempting it would burn an iteration to
                rediscover that. G3 is the highest-severity gate that can
                actually be moved. See BLOCKERS.md.
Hypothesis    : excursions are bounded by PEAK positions, so the eccentric
                starts at the previous rep's top and swallows the lockout. The
                error is a consistent -13 frames on S01 — exactly the lockout's
                length, which is what marks it structural rather than noisy.
                Boundaries should come from where the bar starts and stops
                MOVING.
Failing test  : `tests/test_phases.py` (4 tests), committed alone in 450e7de.
                3 failed, 1 passed — the passing one is `bottom`, which was
                never the problem and is there so the fix cannot break it.
Change        : `_phases` walks in from each peak to the first frame moving
                faster than a fraction of the excursion's own peak speed. The
                fraction is in thresholds.yaml.

| Gate | Before | After |
|---|---|---|
| G1 `rep_count_exact` | green | green |
| G2 `depth_verdict_agreement` | red (5/8) | red (5/8) |
| G3 `phase_boundary_error` | **red (4.0 frames)** | **green (3.0 frames)** |
| G4 `unsafe_rule_recall` | blocked | blocked |
| G5 `minor_rule_precision` | blocked | blocked |
| G6 `no_verdict_on_low_quality` | green | green |
| G7 `determinism` | green | green |
| G8 `runtime_p95` | green (12,335 ms) | green (12,446 ms) |
| G9 `no_unhandled_exceptions` | green | green |
| G10 `no_magic_numbers` | green | green |

Summary: 6 green / 2 red / 2 blocked → **7 green / 1 red / 2 blocked**.
No previously-green gate regressed.

Verdict : improved

Notes:

- **The diagnosis came from the shape of the error, not from its size.** Every
  eccentric was wrong by the same 13 frames, and 13 was the lockout's length.
  A consistent error is a structural mistake; a scattered one is noise. Reading
  the per-boundary table before touching code is what made this a ten-minute
  fix rather than a threshold hunt.
- **G3 is green at exactly 3.0 against a target of ≤ 3.0.** That is a pass with
  no margin, and it should be treated as fragile: the remaining error is the
  `bottom` boundary at -5 frames, which the motion-onset change did not touch.
  If real footage moves this at all, it moves it red. Worth a follow-up
  iteration rather than being called done.
- Runtime moved 12,335 → 12,446 ms, which is noise, not a regression.

---

# STOPPING

Three gates remain and **none of them can be moved without a human decision or
footage that does not exist**:

- G2 needs pose, which needs either real clips or a change to what the
  synthetic clips are for.
- G4's recall is computed over labelled `unsafe` faults. There is exactly one
  in the golden set, R05, and it has not been recorded.
- G5's precision is computed over emitted `minor` findings. The only clip that
  can produce them is R09, also not recorded.

Continuing would mean either grinding on a blocked gate or inventing footage,
so the loop stops here per its own rules. `BLOCKERS.md` sets out the options.

Iterations used: 3 of 8.

---

## Post-stop hardening — the two items logged as owed

Not Loop A iterations: neither moves a red gate. Both were debts named in
BLOCKERS.md, and both are the kind that get more expensive the longer they sit
behind footage that has not arrived yet.

### ffprobe and rotation — CLOSED (102e760)

ffmpeg installed. `rotation.py` reads the Display Matrix side packet and the
`rotate` tag, normalises them (ffmpeg reports the matrix as a negative angle,
so −90 and 270 are the same orientation, and normalising is what lets the two
be compared at all), and refuses a clip whose sources disagree or whose angle
is not a right angle. Ingest returns `ambiguous_rotation`.

Guessing between conflicting sources would be a coin flip that silently
rotates the entire analysis, and it has no symptom: a portrait squat measured
sideways produces angles wrong by ninety degrees that look completely
plausible. Every golden-set clip will come off a phone.

Where ffprobe is absent the pipeline still runs and rotation goes UNKNOWN
rather than being assumed zero.

Moves no gate — no clip in the golden set carries rotation metadata, which is
exactly why this had to be closed on principle rather than in response to a
red number.

### G3's missing margin — CLOSED

| | Before | After |
|---|---|---|
| Median boundary error | 3.0 frames (target ≤ 3.0) | **1.0 frames** |
| eccentric / bottom / concentric / lockout | +1 / −5 / +3 / 0 | +1 / −1 / +1 / 0 |

One mistake, not two. The bottom was defined as "within 5% of the deepest
point" — a POSITION band — and with a cosine turnaround the bar sits inside
that band far longer than it is genuinely stationary. The span came out 14
frames against a true 6, starting early and ending late, and dragged the
concentric start three frames late with it.

The bottom is now where the bar is not MOVING, which is the criterion the
eccentric start already used. Both ends of a rep are defined the same way
instead of one by movement and one by position.

Worth noting what this cost: nothing. The velocity floor was already computed
for the motion-onset fix, so the change was to stop using a second, worse
criterion beside it. The 0.05 position band had also been a float literal sat
in the code — G10 does not scan `segmentation.py` today, but it would have
been a magic number the moment those rules moved into `rules/`.

Gates after both: **7 green / 1 red / 2 blocked**, unchanged in count. G3's
margin went from zero to two frames, which is the point.

---

## Iteration 4 — bar tracking against real footage

Triggered by the first real clip ever fed to this pipeline: 61 s of deadlifts,
1920x1080 landscape at 60 fps, pulled from the user's own R2 upload.

**It reported 71 reps.** Coverage said 100%.

### What was actually wrong, in three layers

**Layer 1 — no continuity.** Hough was asked for circles in each frame
independently and given whatever came back. Median frame-to-frame movement was
81 px, maximum 992 px. A barbell cannot move 992 px in 1/60 s. The path was a
scatter plot and the segmenter faithfully found 71 excursions in it.

**Layer 2 — coverage was not confidence.** "I found a circle" is not "I found
the bar", and nothing could fall, so nothing could trigger an abstention.

**Layer 3, and the one I got wrong twice — THE PRIOR SELECTED FOR CEILING
LIGHTS.** After fixing continuity the count dropped 71 → 7 and I reported that
as progress. It was not. The user watched the annotated video and said it was
tracking lights. Measuring where the tracked point actually sat:

| | ceiling-lock | after motion gating |
|---|---|---|
| median y | 227 / 1080 (**21% — the ceiling**) | 637 (59%) |
| median radius | 223 px | 173 px |
| coherence | 74% | 64% |

The bar was identified as "the two circles at the most similar height". That
is a precise description of a row of ceiling lights. The heuristic did not
fail — it worked, on the wrong objects, with perfect coherence.

### The fix, and the one it broke first

The spec said "Hough circles **+ optical flow**". Only the Hough half had been
built. The camera is static by scope, so the room does not move and the bar
does — MOG2 background subtraction separates them where geometry could not.

First attempt gated EVERY frame on motion, which regressed both synthetic
clips from 5 and 3 reps to abstaining: a bar that pauses at lockout is learned
as background within a second. Motion now gates ACQUISITION only. Once the
right object is held, continuity keeps it, and a plate that stops moving is
still the plate.

| Gate | Before | After |
|---|---|---|
| G1 `rep_count_exact` | green (2/2) | green (2/2) |
| G6 `no_verdict_on_low_quality` | green | green |
| others | unchanged | unchanged |

Verdict : improved, but NOT resolved

### What is still wrong

The real clip now reports **1 rep** and I do not believe that either. Tracked
travel is 88% of frame height; a deadlift bar travels roughly hip height, not
the whole frame. Coherence is 64%, barely over the 60% floor.

So: the ceiling-lock is gone and the absurd count is gone, but the tracker is
still not reliably on the bar. **I cannot verify the count** — I do not know
the true number of reps in that clip and have no way to watch it. The
annotated video is at `evals/artifacts/USER_latest_tracked.mp4` and a human
can answer in seconds what I cannot answer at all.

### The escalation the spec anticipated

> "Hough circles + optical flow first; only escalate to a fine-tuned YOLOv8n
> if the gate fails."

Both halves of the first option are now built and the gate still fails on real
footage. That is the documented trigger, and it needs a decision rather than
another attempt — see BLOCKERS.md.

---

## Iteration 5 — the object had no fixed size, and nothing noticed

### What I measured instead of assuming

Iteration 4 ended with "1 rep, and I do not believe it" and a plan to ask for
a decision. Before asking, I measured one property I had never constrained:
**the size of the thing being tracked.**

```
radius   median 173 px   p5 72   p95 234      spread 3.25x
radius   frame-to-frame change: median 11 px, p95 88 px
x drift  104% of frame height
```

A plate is rigid and the camera is static, so its apparent radius is fixed up
to the lifter's own depth change — call it 20%. This thing changed size by
**3.25x**, and jumped by more than half its own radius between consecutive
frames, and travelled sideways further than the frame is tall.

### The defect

`_follow` constrained POSITION and nothing else. The jump limit is 4% of frame
height, sized so a real bar is never rejected — which also makes it large
enough to step onto whatever is next door. Do that 3692 times and the lock is
anywhere at all, having been continuous at every single step.

Coherence could never catch this. It asks "did frame *n* follow from frame
*n−1*", and the answer was yes, all the way across the room.

**Fix: identity is position AND size.** The held radius is a 15-frame median,
the search band is derived from it, and a candidate outside ±25% is not the
same object. A fresh acquisition clears the memory, because a new object has
a new size and blending the two averages into a third thing that is neither.

| | before | after |
|---|---|---|
| coherence | 0.64 | **0.81** |
| radius spread | 3.25x | **1.39x** |
| frame-to-frame \|dr\| median | 11.2 px | **2.2 px** |
| S01 / S02 reps | 5 / 3 | **5 / 3** (no regression) |

### AND IT WAS STILL WRONG

Holding one object made the wrong answer *stickier*, which is worse:

```
76 locked runs; the longest is frames 834-3692 — 47.6 SECONDS UNBROKEN
  radius 166.5 constant, y moves 121 px (11% of frame height)
  -> status ok, 4 reps
```

47.6 seconds of perfect lock on something that barely moves. That is a
fixture on a wall, and it scores *better* on both confidence signals than a
real barbell does, because a wall is the most coherent and most size-stable
object in any room. Two gates, both green, both wrong.

### The third signal: the plate is its own ruler

Stage 5 does not exist, so there is no px-per-metre — but a **ratio** needs no
calibration, and the one object of known size in the frame is the thing being
tracked. A competition plate is 450 mm across, so one radius is ~22 cm
regardless of the camera.

Every supported lift moves the bar much further than that: bench ~40 cm, dead
~55 cm, squat ~60 cm. So `travel_in_radii < 1.0` is not a tuned threshold, it
is a statement that no rep happened.

Measured p5–p95, not min–max. Min–max read **4.22 radii** on this clip — a
handful of stray acquisitions near the start stretching a lock that actually
moved 0.5 — and would have waved it straight through the gate written to stop
it. That was very nearly the same mistake a third time.

```
REAL   coh 0.81  spread 1.39  travel 0.88r  ->  insufficient_quality, 0 reps
S01    coh 0.93  spread 1.04  travel 5.31r  ->  ok, 5 reps
S02    coh 0.92  spread 1.04  travel 4.19r  ->  ok, 3 reps
```

Real reps clear the floor by 4-5x. The floor only ever catches things that
are not moving.

| Gate | Before | After |
|---|---|---|
| all ten | 7 green / 1 red / 2 blocked | **unchanged** |

Verdict : the pipeline is now HONEST, and acquisition is still broken

### What this changes about the escalation

Iteration 4 asked for a decision on the whole tracker. The measurement narrows
it to one half. **Following works** — 47.6 seconds of unbroken lock, 2 px of
size jitter, on real 1080p footage. **Acquisition does not** — it picks the
wrong object and following then holds it faithfully.

That is a much better position than "the tracker fails", because acquisition
is the half a single tap replaces. See BLOCKERS.md §4.

The pipeline no longer claims anything about this clip, which is the outcome
the abstain rule exists for. It does not yet analyse it.

---

## Iteration 6 — the video was sideways, and had been all along

### What the user saw that I could not

They watched the annotated render and said the tracking looked correct. That
contradicted my own measurement, which said the tracker was stuck on a static
object. So I extracted frames and LOOKED at them, which I should have done in
iteration 4 instead of reasoning about percentiles.

The green circle was on the plate. It had been on the plate. But **the lifter
was lying on their side**, because the clip is portrait video in a landscape
container:

```
CAP_PROP_ORIENTATION_META : 90.0     <- the container says rotate
CAP_PROP_ORIENTATION_AUTO : 0.0      <- OpenCV does not
probe                     : 1920x1080 (should be 1080x1920)
```

**Segmentation runs on `y`. The bar's vertical travel was in `x`.** Every
symptom of the last three iterations was this one fact:

| measured | I read it as | it actually was |
|---|---|---|
| y travel 11% of frame | "this object barely moves" | sideways drift, correctly measured |
| x drift 53% of frame | ignored | THE REPS |
| 71, then 7, then 1, then 4 reps | tracker instability | noise on the wrong axis |
| travel 0.88 radii | "a wall fixture" | the plate, measured across its width |

The tracker was never the problem. It had locked onto the plate and followed
it accurately, and I spent three iterations hardening a component that was
working — while the actual defect sat in ingest, where `rotation_from_probe`
was CALLED AND ITS RESULT DISCARDED (`ingest.py:140`, no assignment). It
validated orientation and never applied it. ffprobe also was not resolving
from Python, so even that no-op was a no-op.

### The fix

`decode.open_video` sets `CAP_PROP_ORIENTATION_AUTO` before the first read,
and all three captures in the codebase go through it. Orientation is resolved
ONCE, at decode, rather than carried downstream as a number every consumer has
to remember to apply — an analyser that measures lifts cannot be agnostic
about which way gravity points.

`probe` reports post-rotation dimensions, so `min_short_side_px` now checks a
resolution somebody actually decodes.

### Then the fan

Upright, acquisition immediately found a new adversary: **a wall fan**. It is
circular, it is the same size as the plate at this camera distance, and its
blades move — so it satisfies the circle test, the size test and the motion
test simultaneously. Size cannot separate those two objects.

The lock sat correctly on the plate at y=1035 and periodically jumped 900 px
to the fan at y=119. Each teleport became a rep.

Two changes, both physical rather than tuned:

- **One clip has one plate, and it keeps its size.** An `established` radius
  is fixed once from a full memory of agreeing frames and never revised;
  re-acquisition is confined to it, and it survives every loss because the
  plate does not change between occlusions. Centring the band on a *rolling*
  median instead let the band itself walk — 25% per frame compounds.
- **Recovery stays local.** Losing the lock for 0.2 s does not entitle the
  search to the whole frame. The bar was nearby a moment ago; the fan never
  was.

```
                 iter 5   +rotation   +established   +local recovery
coverage           0.83      0.63          0.83           0.59
coherence          0.83      0.62          0.83           0.59
radius spread      1.39      3.33          1.53           1.42
travel (radii)     0.88      4.09          8.10           2.65
verdict          abstain   abstain      ok, 6 reps      abstain
```

The `ok, 6 reps` column is the one to distrust: rep 1 spanned frames 0-1756,
a 29-second "rep". That was the fan teleports being segmented.

### Where it stands

**Abstains at 59% coherence against a 60% floor.** Genuinely borderline, and
the right answer at that number — but it is one point away, so the gate is not
what is holding it back; the missing 40% of frames is.

The locked path is now credible for the first time: centred at (416, 740) on a
1080x1920 frame, y ranging 533-1019, which is roughly three plate radii of
vertical excursion. That is what a deadlift looks like.

Synthetic clips unchanged at 5 and 3 reps. 60 tests pass. Gates unchanged.

### What I got wrong, and the lesson

I diagnosed "wall fixture" from percentile statistics and wrote it into
BLOCKERS.md as settled, having never looked at a single frame. The user looked
and was right within seconds. **Extract frames before theorising about
tracking** — an image answers in one glance what a distribution cannot answer
at all, and I had the capability the whole time.
