# Blockers

Loop A stopped after 3 of 8 iterations at **7 green / 1 red / 2 blocked**. It
stopped because the three remaining gates cannot be moved by writing code —
each needs a decision or footage that does not exist. Grinding past that point
is how a week disappears into a threshold that was never the problem.

Each blocker below names the options and what each one costs. They need a
human answer, not a guess.

---

## 1. MediaPipe finds nothing in the synthetic clips — blocks **G2**

**The finding.** MediaPipe Pose detected **0 poses across 24 sampled frames**
of S01. Not low confidence — no detection at all. The clips are stick figures
and the model is trained on photographs of people.

**Why it blocks G2.** `depth_verdict_agreement` compares the depth rule's
verdict against a per-rep label. The rule measures hip height against knee
height, so it needs a hip and a knee. Bar tracking cannot supply them: the bar
tells you where the bar is, and a squat's depth is a fact about the body.

G2 currently reads 5/8, and that number is correct rather than broken — with no
depth rule, nothing trips, every rep is predicted "depth ok", S01's five good
reps agree and S02's three shallow ones do not.

**Options.**

**(a) Record the real clips.** R01 and R02 alone unblock this, and R02 is
already specified as a within-clip contrast — two deep reps then three clearly
high — which is exactly what a depth gate needs. Cost: an hour in a gym.
Everything else here also wants this footage, so it is the option that unblocks
the most.

**(b) Have the generator emit ground-truth keypoints beside each clip.** It
already knows where the hip and knee are, because it draws them. The depth rule
could then be tested against exact keypoints now, and against MediaPipe later.
Cost: half a day, plus a real caveat — G2 would then mean *"the depth rule
computes correctly given perfect keypoints"*, not *"the pipeline gets depth
right on video"*. That is a weaker claim than the gate's name implies, so G2
would have to be scoped in GATES.md the way G3 already is. It de-risks the rule
maths and proves nothing about pose.

**(c) Make the synthetic clips photorealistic enough for MediaPipe.** Cost:
days, and it is the wrong shape of work. Synthetic clips exist to make the
segmentation maths testable with exact labels; turning them into a rendering
project makes them a worse tool for that and still not a substitute for real
footage.

**Recommendation: (a), with (b) if the footage is more than a week away.**
(b) is genuinely useful — it separates "is the rule right" from "does pose
work", which are different questions that will otherwise fail together and be
debugged as one.

---

## 2. No `unsafe` fixture exists — blocks **G4**

`unsafe_rule_recall` is the highest-severity gate in the suite, because missing
a spine folding under load is the expensive error. Its recall is computed over
labelled `unsafe` faults, and the golden set contains exactly one: **R05**, the
deadlift with visible rounding. It has not been recorded.

With zero labelled positives the gate is not failing — it is unmeasurable, and
correctly reports `blocked` rather than inventing a score.

**Options.**

**(a) Record R05.** Light load, deliberate, careful. The manifest says so and
it is worth repeating: do not injure yourself for a test fixture.

**(b) Ship with G4 unmeasured**, and say so plainly in the release notes — the
`unsafe` rule is the one thing in this pipeline that could matter medically,
and shipping it with no recall evidence is a decision to take in the open.

**(c) Drop the `unsafe` severity from v0.1 entirely.** The deadlift rounding
rule ships disabled, no verdict claims to be a safety warning, and G4 is
removed rather than left permanently blocked. Honest, and loses the feature.

**Recommendation: (a), or (c) if it cannot be filmed safely.** Not (b). A
safety-severity finding with no recall measurement is the worst of the three —
it carries the authority of a warning and none of the evidence.

---

## 3. No clip reaches the set-level rules — blocks **G5**

`minor_rule_precision` is computed over emitted `minor` findings.
`velocity_loss_fatigue` and `rom_inconsistency` are the only `minor` rules, and
both need a long fatiguing set: they cannot fire on a 5-rep clip with even
tempo. **R09** is the only fixture that reaches them and is not recorded.

There is a second dependency worth knowing: `velocity_loss_fatigue` needs
calibration, so R09 must have a plate visible throughout or the rule is
suppressed and the gate stays blocked even with the footage.

**Options: record R09, or accept G5 unmeasured until it exists.** Lower stakes
than G4 — a missed `minor` finding costs nothing, and the gate exists to stop
the app nagging people about non-problems.

---

## Not blocking, but owed

~~**ffprobe is specified and not used.**~~ **CLOSED (102e760).** ffmpeg is
installed. `rotation.py` reads both the Display Matrix side packet and the
`rotate` tag, normalises them — ffmpeg reports the matrix as a negative angle,
so −90 and 270 are the same orientation — and refuses a clip whose sources
disagree or whose angle is not a right angle. Ingest returns
`ambiguous_rotation` for those. Where ffprobe is absent the pipeline still
runs and rotation goes UNKNOWN rather than being assumed zero, which was the
failure being prevented.

~~**G3 passes with no margin.**~~ **CLOSED.** Median boundary error is now
**1.0 frames** against a target of ≤ 3.0, down from exactly 3.0.

The cause turned out to be one mistake rather than two. The bottom was defined
as "within 5% of the deepest point" — a POSITION band — and with a cosine
turnaround the bar sits inside that band far longer than it is genuinely
stationary. The span came out 14 frames against a true 6, starting early and
ending late, which dragged the concentric start three frames late with it.

The bottom is now where the bar is not MOVING, which is the criterion the
eccentric start already used. Both ends of a rep are defined consistently
instead of one by movement and the other by position, and every phase now
lands within a single frame.

**Runtime is 12.4 s for a 480-frame clip.** Extrapolating to a 900-frame 30 s
clip gives roughly 23 s against a 45 s target — green, with less headroom than
the number suggests, because Hough runs on every frame at full rate.

**Loop C cannot start.** It needs G1 and the kinematics gates green; kinematics
does not exist. Nine of fourteen rules also ship `enabled: false` for want of a
fixture, and a threshold swept against zero labelled positives is a number with
a date on it and nothing behind it.

---

## 4. Bar tracking does not hold the bar on real footage — blocks everything

**Added after iteration 4.** This is now the top blocker, ahead of the three
above, because every measurement in the pipeline is derived from the bar path.

**What happened.** The first real clip — 61 s of deadlifts, the user's own
upload — was reported as **71 reps**. After adding continuity it became 7, and
I called that progress. It was not: the tracker had locked onto the ceiling
lights. Median tracked position was 21% down the frame with a 223 px radius.
The bar was being identified as "the two circles at the most similar height",
which is exactly what a row of ceiling lights looks like.

Adding motion gating (MOG2, camera is static by scope) removed the ceiling
lock. Then iteration 5 found that the tracked object had no fixed **size** —
its radius varied 3.25x and it drifted 104% of frame height sideways, because
`_follow` constrained position and nothing else. Constraining size too took
coherence to 81% and spread to 1.39x.

**AND IT IS STILL WRONG, which is the part that matters here.** The tracker
now holds a single object for **47.6 unbroken seconds** while it moves 11% of
frame height. That is a fixture on a wall, and it scores *better* on both
confidence signals than a real barbell does, because a wall is the most
coherent and most size-stable thing in any room.

A third check — vertical travel measured in plate radii, the plate being the
only object of known size in frame — now refuses the clip outright
(`insufficient_quality`, 0 reps) instead of reporting 4. So the pipeline is
honest about it. It still cannot analyse it.

**WHAT THIS NARROWS THE DECISION TO.** Iteration 4 said "the tracker fails".
That was too broad. Measured:

- **Following works.** 47.6 s of unbroken lock, 2 px of frame-to-frame size
  jitter, on real 1080p footage. That is a working tracker.
- **Acquisition fails.** It picks the wrong object, and following then holds
  that wrong object faithfully and forever.

Only the first frame is the problem. Every option below should be read as
"how do we find the bar ONCE".

**The spec's own escalation applies:**

> "Hough circles + optical flow first; only escalate to a fine-tuned YOLOv8n
> if the gate fails."

Both halves are built. The gate still fails.

**Options.**

**(a) Fine-tuned YOLOv8n plate detector.** What the spec named. Robust to
clutter in a way a Hough transform cannot be, because it learns what a plate
looks like rather than what a circle looks like. Cost: needs labelled plates —
a few hundred boxes across varied gyms — plus ~900 ms/clip and a new
dependency. It is the answer that actually works, and it is a week, not a day.

**(b) Ask the user to tap the plate once, in the first frame.** Removes
acquisition entirely, which is the half that keeps failing; template-matching
from a known patch is far easier than finding it cold. Cost: one interaction
per clip, and it changes the product — analysis stops being automatic. The
spec's own staging suggested exactly this as step 2 ("points by hand... proves
the metrics are worth having before anyone writes a tracker").

**(c) Constrain the capture instead.** Require the plate to be the largest
moving object and the camera side-on at a stated distance, and abstain
otherwise. Cheapest by far, and it narrows who can use the feature to people
who film it exactly right — which, given a static-camera scope already, may be
less of a narrowing than it sounds.

**Recommendation: (b) now, (a) later** — and iteration 5 strengthens it
considerably. A tap is not a workaround for a broken tracker; it supplies the
one input the working tracker is missing. Following already holds an object
for 47 seconds with 2 px of jitter, so handing it the right object in frame 0
is the entire remaining problem, and a fingertip solves it exactly.

It also unblocks everything downstream this week — calibration, kinematics,
rules, scoring — instead of leaving them behind a detector that is itself a
week of work. (a) then replaces acquisition later without touching anything
else, because the interface is just "where is the bar in frame 0". The two
options are the same seam.

**What is NOT an option: leaving it as it is.** ~~It currently answers `ok`
with 1 rep on a clip it is not tracking.~~ **CLOSED in iteration 5.** Three
signals now gate the result — continuity, size stability, and vertical travel
in plate radii — and the clip is refused rather than answered. Coherence and
size stability both scored green on a wall fixture; travel is what caught it.
The lesson is worth keeping: each of these was added after the previous one
was measured passing on something plainly wrong.

### 4a. What is left of it after the tap — acquisition during a long rest

**Added after iteration 8.** The tap fixed frame 0 and following holds from
there, but the lock is still lost and re-acquired badly while nothing is
happening. Frames extracted across the real clip with the tracked circle drawn
on them show it plainly:

```
  0-30 s   the circle is on the lifter's BACK, then a pole, then his shoulder.
           The plate sits on the floor untouched the whole time.
 30-61 s   the circle is on the plate, every frame.
```

The lifter spends the first 30 seconds walking up, bending over the bar and
standing again without lifting it. The plate is stationary, so the motion mask
has nothing to offer, and re-acquisition takes whatever moving circle is
nearest — which is the lifter.

**It costs a real rep and invents a fake one.** The rep at ~30 s is discarded
because the frames either side of its turnaround are on the wrong object, so
its measured range is 37 px; a 0.2 s excursion at 1-3 s is counted instead.
The clip reports 3 reps, which is the right number for the wrong reasons.

This is why the count on the real clip should not be read as evidence for
anything yet. It is a tracking problem, not a segmentation one — segmentation
was measured separately in iteration 8 against the half of the clip that is
tracked correctly, and reps 2 and 3 match the video.

---

## 5. ~~Segmentation swallows the rest between reps~~ — CLOSED (iteration 8)

Raised at the end of iteration 7, when the first correctly tracked real clip
came back as three reps of 20.1 s, 9.1 s and 22.4 s. Three causes, all closed:
every lift was modelled as a squat, so a deadlift's rest sat in the MIDDLE of
each reported rep; the trailing pause of every rep ran to the start of the next
one, so the phases tiled the whole clip; and the per-frame velocity test used
to find a rep's edges cannot cross a rest plateau on real footage, where
centroid jitter is 0.7-1.7 px per frame against a 0.96 px floor.

Reps 2 and 3 now match the video to the phase. See ITERATION_LOG.md.
