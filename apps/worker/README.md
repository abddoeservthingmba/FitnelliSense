# @fi/worker — the analysis worker

The thing that was missing. Everything else in the video pipeline has existed
for a while — consent, the presigned upload, the analysis row and its states,
the record screen, the result screen — but nothing anywhere looked at a
`queued` row. [ADR 0005](../../docs/adr/0005-video-storage-and-bar-path-capture.md)
said so plainly: *"an uploaded clip reaches `queued` and stays there until a
worker exists."*

## What it does, per clip

1. Claims the oldest `queued` analysis in one atomic `UPDATE`.
2. Streams the video out of R2 to a temporary file.
3. Runs the Python analyzer, which tracks the bar and writes its **path**.
4. Hands that path to `@fi/domain`, which computes every published number.
5. Writes the result, or a reason a lifter can act on.

## Why the analyzer only emits a path

`packages/domain/src/bar-path.ts` already turns a pixel path into metres, reps,
velocities and bar drift, is unit-tested at 100% branch coverage, and is what
`analysisResultSchema` was written against. Its own docstring names the seam:

> This module is deliberately ignorant of how the point was tracked. Whether it
> came from a vision model, an optical-flow patch or someone tapping the plate
> frame by frame, the input is the same: a sequence of positions in pixels with
> timestamps.

So the analyzer's job stops at tracking. Recomputing metres in Python would put
the same arithmetic in two languages, against the project's rule that domain
logic lives only in `packages/domain` — and it would be the worse copy.

The one thing that does cross as a verdict is the **abstention**: whether the
bar was followed well enough to measure at all. Only the tracking side can say
that, and a consumer handed 3,692 samples has no way to know they describe a
wall fan.

## No queue, no broker, no container

The BRD rules out Redis, Kafka and Docker (§3.3.1) and none is needed. The
queue is a column — `status = 'queued'` — and claiming is a conditional
`UPDATE` with `FOR UPDATE SKIP LOCKED`, which is atomic on its own and safe if
two workers ever race. The cost is a poll every few seconds.

## Running it

Needs a Python interpreter with the analyzer's pinned dependencies. Create one
with `make setup` in `services/analyzer` — it deliberately lives outside the
repo, because opencv, mediapipe, scipy and numpy come to about half a gigabyte.

```
cp apps/worker/.env.example apps/worker/.env    # then fill it in
pnpm --filter @fi/worker start                  # poll until stopped
pnpm --filter @fi/worker once                   # one clip, then exit
```

`once` is the useful one when checking a change: it claims a single row, works
it, and exits, so a bad deployment cannot chew through a backlog.

## Where it runs

**On a developer's machine, against production.** That is a deliberate interim
answer, not an oversight. ADR 0005 already notes that ffmpeg and OpenCV do not
fit Render's free instance, and Render's background workers are a paid plan —
so the alternatives were to spend money or to leave analysis unavailable. A
laptop polling the production database makes the feature real for users while
it is on, and the worker is built so that being killed mid-clip is survivable:
see `requeueAbandoned`.

The consequence to be honest about is that **analysis is not available when the
machine is off**. Clips still upload and are still kept; they sit in `queued`
until the worker next runs, which is the state the row was designed to express.

## Concurrency

One clip at a time, one database connection. The analyzer saturates a core and
decodes a whole video into memory, so parallelism here would not make it faster
and would risk the box. `requeueAbandoned` assumes a timeout rather than
exclusivity, so a second worker is safe to add if that ever changes.

## The tap

Tracking on real gym footage abstains far more often than it succeeds without
one. Deciding which circular thing in a gym is the bar is the half that kept
failing — ceiling lights, then a wall fan, then a circle twice the plate's size
— and on the first real clip the guess reached 59% frame-to-frame coherence and
was refused, while a tap reached 85% and produced a measurable path.

The tap travels as **fractions of the upright frame** the lifter saw, never
pixels. A phone knows where the tap landed in the view it drew; what it does
not reliably know is the source resolution, because Android reports a rotated
clip's dimensions inconsistently. The analyzer resolves the fraction against
the frames it actually decodes, which is the only place that can. Asking either
side of that boundary to reason about container rotation is exactly the
confusion that had this pipeline measuring deadlifts sideways for three
iterations.

## Known gaps

- **A clip whose analysed window is not the whole file is refused.** The window
  exists so someone can pick which three minutes of a long recording to
  measure, and honouring it needs the decoder to skip frames, which the
  analyzer does not do yet. Analysing the whole file instead would measure a
  part of the video the lifter did not choose. The 80 MB upload cap makes this
  rare; it does not make it impossible.
- **No form findings and no score.** Pose, kinematics, rules and scoring are
  stages 2-5 and 8-11 of the analyzer and are not built. What ships is rep
  count, per-rep range of motion and tempo, concentric velocity, velocity loss,
  bar drift and straightness — every one of them measured, none of them
  guessed.
- **Runtime is about two minutes for a one-minute clip**, against a 45-second
  target (G8). Untouched here.
