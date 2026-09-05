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
