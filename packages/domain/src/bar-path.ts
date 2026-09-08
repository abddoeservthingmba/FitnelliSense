/**
 * Bar path analysis — turning a tracked point into the numbers a lifter uses.
 *
 * This module is deliberately ignorant of how the point was tracked. Whether it
 * came from a vision model, an optical-flow patch or someone tapping the plate
 * frame by frame, the input is the same: a sequence of positions in pixels with
 * timestamps. That keeps the hard, testable arithmetic separate from the
 * capture technique, which will change.
 *
 * Two conventions are fixed here and nowhere else:
 *
 * **Pixels come in with y pointing DOWN**, because that is what every image
 * coordinate system does. Everything past `toMetres` uses y pointing UP, so
 * "the bar went up" is a positive number. Getting this wrong inverts every
 * concentric and eccentric in the app, so the flip happens exactly once, at the
 * boundary, and never again.
 *
 * **Scale comes from a known object in frame.** A camera cannot know distance,
 * so pixels only become metres against a reference. A competition plate is
 * 450 mm across and is already in the shot, which makes it the natural ruler.
 */

/** The diameter of a standard competition plate. The ruler in every gym. */
export const PLATE_DIAMETER_MM = 450;

/** One tracked position, straight from the tracker. Pixels, y pointing down. */
export interface PixelSample {
  readonly tMs: number;
  readonly x: number;
  readonly y: number;
}

/** One position in the physical frame: metres, y pointing up, origin at start. */
export interface PathPoint {
  readonly tMs: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Pixels per metre, from a plate measured in the frame.
 *
 * Returns null rather than throwing when the measurement is unusable: a plate
 * of zero pixels means the tracker failed, which is a normal outcome to report,
 * not an exceptional one.
 */
export function calibrationFromPlate(
  plateDiameterPx: number,
  plateDiameterMm: number = PLATE_DIAMETER_MM,
): number | null {
  if (!Number.isFinite(plateDiameterPx) || plateDiameterPx <= 0) return null;
  if (!Number.isFinite(plateDiameterMm) || plateDiameterMm <= 0) return null;
  return plateDiameterPx / (plateDiameterMm / 1000);
}

/**
 * Pixel samples to metres, y flipped so up is positive, origin at the first
 * sample.
 *
 * Samples whose timestamps do not advance are dropped. Trackers repeat and
 * reorder frames, and a zero or negative interval would divide into every
 * velocity downstream — so the guarantee is established once, here, and every
 * function past this point can assume strictly increasing time.
 */
export function toMetres(samples: readonly PixelSample[], pixelsPerMetre: number): PathPoint[] {
  if (!Number.isFinite(pixelsPerMetre) || pixelsPerMetre <= 0) return [];

  const usable = samples.filter(
    (sample) =>
      Number.isFinite(sample.tMs) && Number.isFinite(sample.x) && Number.isFinite(sample.y),
  );

  const ordered: PixelSample[] = [];
  for (const sample of usable) {
    const previous = ordered[ordered.length - 1];
    if (previous === undefined || sample.tMs > previous.tMs) ordered.push(sample);
  }

  const origin = ordered[0];
  if (origin === undefined) return [];

  return ordered.map((sample) => ({
    tMs: sample.tMs - origin.tMs,
    x: (sample.x - origin.x) / pixelsPerMetre,
    // The flip. Image y grows downward; a lift that rises must read positive.
    y: (origin.y - sample.y) / pixelsPerMetre,
  }));
}

/**
 * A centred moving average over `window` samples.
 *
 * Tracking output is jittery by a pixel or two every frame, and velocity is a
 * derivative — differentiating raw noise produces spikes that dwarf the signal.
 * Smoothing before differentiating is not optional.
 *
 * The window shrinks at the ends rather than padding, so the first and last
 * samples keep their real positions and the range of motion is not clipped.
 */
export function smoothPath(path: readonly PathPoint[], window = 5): PathPoint[] {
  const half = Math.floor(Math.max(1, window) / 2);
  if (half === 0) return [...path];

  return path.map((point, index) => {
    const from = Math.max(0, index - half);
    const to = Math.min(path.length - 1, index + half);
    let sumX = 0;
    let sumY = 0;
    for (let i = from; i <= to; i += 1) {
      const sample = path[i] as PathPoint;
      sumX += sample.x;
      sumY += sample.y;
    }
    const count = to - from + 1;
    return { tMs: point.tMs, x: sumX / count, y: sumY / count };
  });
}

// -------------------------------------------------------------- shape --

export interface BarPathMetrics {
  /** Highest minus lowest — the range of motion across the whole clip. */
  readonly verticalRangeM: number;
  /** The furthest the bar strayed horizontally from where it started. */
  readonly maxHorizontalDriftM: number;
  /** Total distance travelled, horizontal wander included. */
  readonly pathLengthM: number;
  /**
   * Vertical travel as a fraction of total travel, 0 to 1.
   *
   * 1 is a perfectly vertical bar. This is the honest way to score a path: it
   * cannot be gamed by a short rep, and unlike "deviation in centimetres" it
   * does not punish a tall lifter for having a longer pull.
   */
  readonly straightness: number;
}

const EMPTY_METRICS: BarPathMetrics = {
  verticalRangeM: 0,
  maxHorizontalDriftM: 0,
  pathLengthM: 0,
  straightness: 0,
};

export function barPathMetrics(path: readonly PathPoint[]): BarPathMetrics {
  const first = path[0];
  if (first === undefined) return EMPTY_METRICS;

  let highest = first.y;
  let lowest = first.y;
  let drift = 0;
  let pathLength = 0;
  let verticalTravel = 0;

  for (let i = 0; i < path.length; i += 1) {
    const point = path[i] as PathPoint;
    highest = Math.max(highest, point.y);
    lowest = Math.min(lowest, point.y);
    drift = Math.max(drift, Math.abs(point.x - first.x));

    if (i > 0) {
      const previous = path[i - 1] as PathPoint;
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      pathLength += Math.hypot(dx, dy);
      verticalTravel += Math.abs(dy);
    }
  }

  return {
    verticalRangeM: highest - lowest,
    maxHorizontalDriftM: drift,
    pathLengthM: pathLength,
    // A bar that never moved has no shape to score. Zero, not NaN.
    straightness: pathLength > 0 ? verticalTravel / pathLength : 0,
  };
}

// ---------------------------------------------------------------- reps --

/**
 * Below this much movement, a reversal is noise or a lifter shifting their
 * grip — not a rep. Roughly a third of the shallowest real range of motion.
 */
export const MIN_REP_RANGE_M = 0.1;

/**
 * A rep must also reach this fraction of the set's own typical range.
 *
 * WHY AN ABSOLUTE FLOOR IS NOT ENOUGH, measured on the first real clip fed
 * through this module: 14 reps from a set of three. `MIN_REP_RANGE_M` rejects
 * jitter, and every one of those eleven extras cleared it comfortably — they
 * ranged from 15 cm to 72 cm, because they were not jitter. They were the
 * tracker holding the lifter's back and his shoulder while he walked around
 * setting up, and a shoulder moves further than 10 cm.
 *
 * No absolute number separates those from reps. 72 cm is longer than a real
 * deadlift, so a floor high enough to exclude it excludes the set as well.
 * What does separate them is that REAL REPS OF ONE SET RESEMBLE EACH OTHER:
 * the same lifter moving the same bar through the same range, three or five
 * times over. Anything far below the group is something else.
 *
 * That makes the test relative, and relative to the group rather than to the
 * largest single excursion — one wild candidate must not be allowed to raise
 * the bar for the real ones. See `repRangeReference`.
 */
export const MIN_REP_RANGE_RATIO = 0.6;

/**
 * The fraction of the largest excursion that counts as "in the main group".
 *
 * The reference has to come from the real reps, and the real reps are the ones
 * near the top of the range — so the group is defined from the top down. A
 * plain median over ALL candidates fails exactly when it matters: with three
 * real reps and eleven decoys the median lands among the decoys and licenses
 * them.
 */
const REP_CLUSTER_FRACTION = 0.5;

/**
 * Above this peak concentric velocity, it was not a barbell.
 *
 * A PHYSICAL CEILING, NOT A TUNED ONE, which is what makes it worth having.
 * The fastest bar speed in sport is the second pull of a snatch, at roughly
 * 2 m/s for a world-class lifter; a barbell simply does not travel at 9. So
 * this rejects only paths that could not be lifts, in the same way that
 * measuring travel in plate radii rejects a path that could not be a rep.
 *
 * It is the check that catches what the relative test cannot. On the first
 * real clip, two candidates survived the range comparison — 0.72 m and 0.53 m,
 * plausible deadlift ranges — because they came from the tracker holding the
 * lifter's shoulder while he walked, and a shoulder crossing the frame covers
 * a real distance. They peaked at 9.08 and 4.87 m/s. The genuine reps in the
 * same clip peaked at 0.94 and 0.87, so the two populations are separated
 * threefold on either side of this number.
 *
 * Velocity is only available because the plate gives a scale. Before
 * calibration existed there was no way to state this check at all, which is
 * why it is expressed in m/s and lives here rather than in the tracker.
 */
export const MAX_REP_PEAK_VELOCITY_MS = 3.0;

/**
 * The range a typical rep of this set covers, in metres.
 *
 * A median over the main group rather than a mean, so one candidate cannot
 * drag it. Exported because it is the number a caller needs to explain why a
 * rep was rejected, and a threshold nobody can see the other side of is a
 * threshold nobody can argue with.
 */
export function repRangeReference(ranges: readonly number[]): number | null {
  const usable = ranges.filter((range) => Number.isFinite(range) && range > 0);
  const largest = Math.max(...usable, 0);
  if (largest <= 0) return null;

  const group = usable.filter((range) => range >= largest * REP_CLUSTER_FRACTION).sort((a, b) => a - b);
  const middle = Math.floor(group.length / 2);
  const median =
    group.length % 2 === 1
      ? (group[middle] as number)
      : ((group[middle - 1] as number) + (group[middle] as number)) / 2;
  return median;
}

export interface Rep {
  readonly index: number;
  readonly startMs: number;
  /** The turnaround: bottom of a squat, chest on a bench. */
  readonly turnMs: number;
  readonly endMs: number;
  readonly romM: number;
  readonly eccentricMs: number;
  readonly concentricMs: number;
  /**
   * Mean concentric velocity, in metres per second.
   *
   * The number velocity-based training is built on: it falls predictably as a
   * set fatigues, which makes it the one honest signal for when to stop.
   */
  readonly meanConcentricVelocityMs: number;
  readonly peakConcentricVelocityMs: number;
}

interface Turn {
  readonly index: number;
  readonly kind: 'top' | 'bottom';
}

/**
 * Turning points, found with hysteresis.
 *
 * Walk the signal tracking the current extreme; when it reverses by more than
 * `threshold`, that extreme was real — record it and flip direction. A plain
 * "is this sample higher than its neighbours" test finds a maximum every time
 * the tracker wobbles, which is why this uses a swing threshold instead.
 */
function turningPoints(path: readonly PathPoint[], threshold: number): Turn[] {
  const turns: Turn[] = [];
  const first = path[0];
  if (first === undefined) return turns;

  // While the direction is unknown, BOTH extremes have to be tracked. Following
  // only the maximum loses the opening turn of any lift that starts at the
  // bottom — a deadlift's first pull would go uncounted, because by the time
  // the rise cleared the threshold the running extreme had crawled up with it
  // and the floor was no longer anywhere in the record.
  let maxIndex = 0;
  let maxValue = first.y;
  let minIndex = 0;
  let minValue = first.y;
  let rising: boolean | null = null;

  for (let i = 1; i < path.length; i += 1) {
    const value = (path[i] as PathPoint).y;

    if (rising === null) {
      if (value > minValue + threshold) {
        // Risen clear of the lowest point seen: that point was the bottom.
        turns.push({ index: minIndex, kind: 'bottom' });
        rising = true;
        maxIndex = i;
        maxValue = value;
      } else if (value < maxValue - threshold) {
        turns.push({ index: maxIndex, kind: 'top' });
        rising = false;
        minIndex = i;
        minValue = value;
      } else {
        if (value > maxValue) {
          maxValue = value;
          maxIndex = i;
        }
        if (value < minValue) {
          minValue = value;
          minIndex = i;
        }
      }
      continue;
    }

    if (rising) {
      if (value > maxValue) {
        maxValue = value;
        maxIndex = i;
      } else if (value < maxValue - threshold) {
        turns.push({ index: maxIndex, kind: 'top' });
        rising = false;
        minIndex = i;
        minValue = value;
      }
      continue;
    }

    if (value < minValue) {
      minValue = value;
      minIndex = i;
    } else if (value > minValue + threshold) {
      turns.push({ index: minIndex, kind: 'bottom' });
      rising = true;
      maxIndex = i;
      maxValue = value;
    }
  }

  // The last extreme never reverses, so nothing in the loop emits it.
  turns.push(
    rising === true ? { index: maxIndex, kind: 'top' } : { index: minIndex, kind: 'bottom' },
  );
  return turns;
}

/** Mean and peak upward velocity between two indices, in m/s. */
function concentricVelocity(
  path: readonly PathPoint[],
  fromIndex: number,
  toIndex: number,
): { mean: number; peak: number } {
  const from = path[fromIndex] as PathPoint;
  const to = path[toIndex] as PathPoint;
  const seconds = (to.tMs - from.tMs) / 1000;
  const mean = seconds > 0 ? (to.y - from.y) / seconds : 0;

  let peak = 0;
  for (let i = fromIndex + 1; i <= toIndex; i += 1) {
    const current = path[i] as PathPoint;
    const previous = path[i - 1] as PathPoint;
    const dt = (current.tMs - previous.tMs) / 1000;
    // `toMetres` drops repeated timestamps, but `detectReps` is exported and a
    // caller can hand-build a path. Skipping rather than trusting the invariant
    // keeps an Infinity off the screen.
    if (dt <= 0) continue;
    peak = Math.max(peak, (current.y - previous.y) / dt);
  }

  return { mean, peak };
}

/**
 * How far the bar must leave its rest position for the movement to be
 * unmistakable, as a fraction of the rep's own range.
 *
 * Not the boundary itself — only a point that is certainly inside the
 * movement, from which the boundary is found by walking back. See `settled`.
 */
const REST_EXIT_FRACTION = 0.1;

/** Below this fraction of the rep's peak speed, the bar is not moving. */
const STILLNESS_FRACTION = 0.08;

/**
 * The frames where a rep's movement actually begins and ends.
 *
 * WHY A TURNING POINT IS NOT A BOUNDARY. `turningPoints` reports the extreme of
 * each reversal, and when a lifter rests the extreme sits somewhere in the
 * middle of however long they rested. So a rep bounded by turning points runs
 * from the middle of one rest to the middle of the next, and the rest lands
 * INSIDE it.
 *
 * Measured on the first real clip: a deadlift whose pull took 0.9 s and whose
 * lowering took 1.5 s was reported with a 4.69 s concentric and a 10.49 s
 * eccentric, because eight seconds of the bar lying on the floor between reps
 * belonged to the rep either side. That is not only a wrong duration — it is
 * the wrong `meanConcentricVelocityMs`, which came out at 0.115 m/s for a pull
 * that actually averaged nearer 0.6. Velocity-based training is built on that
 * number, so an inflated denominator is the most expensive error in this file.
 *
 * TWO STAGES, because neither test can do the job alone. Displacement crosses
 * a rest reliably — noise wanders inside a band a few pixels wide and a lift
 * leaves it for good — but a gate large enough to clear the noise is reached
 * well after the movement began, so it cannot place the boundary. Speed places
 * it precisely but cannot cross a rest: walking forward from the turning point
 * stops at the first frame above the floor, and on real footage a resting
 * barbell's tracked centroid crosses that floor constantly. So displacement
 * gets inside the movement and speed walks back to its edge, which reverses
 * the fragile direction — inside a real movement the bar is moving far faster
 * than the floor, so no noise dip stops the walk early.
 */
function settled(
  path: readonly PathPoint[],
  fromIndex: number,
  turnIndex: number,
  toIndex: number,
  romM: number,
): { from: number; to: number } {
  const gate = romM * REST_EXIT_FRACTION;

  let peak = 0;
  for (let i = fromIndex + 1; i <= toIndex; i += 1) {
    const dt = ((path[i] as PathPoint).tMs - (path[i - 1] as PathPoint).tMs) / 1000;
    if (dt <= 0) continue;
    peak = Math.max(peak, Math.abs((path[i] as PathPoint).y - (path[i - 1] as PathPoint).y) / dt);
  }
  const stillness = peak * STILLNESS_FRACTION;

  const restY = (path[fromIndex] as PathPoint).y;
  let moving = fromIndex;
  while (moving < turnIndex && Math.abs((path[moving] as PathPoint).y - restY) < gate) moving += 1;
  let from = moving;
  while (from > fromIndex && speedAt(path, from) > stillness) from -= 1;

  const endY = (path[toIndex] as PathPoint).y;
  moving = toIndex;
  while (moving > turnIndex && Math.abs((path[moving] as PathPoint).y - endY) < gate) moving -= 1;
  let to = moving;
  while (to < toIndex && speedAt(path, to + 1) > stillness) to += 1;

  return { from, to };
}

/**
 * Speed of the step INTO `index`, in metres per second.
 *
 * `index` is always at least 1: both callers in `settled` walk within bounds
 * they have already tested. There is deliberately no guard for index 0 — an
 * unreachable one would be a branch no test can cover, and this module is held
 * at 100% branch coverage precisely so that untested paths are visible.
 */
function speedAt(path: readonly PathPoint[], index: number): number {
  const current = path[index] as PathPoint;
  const previous = path[index - 1] as PathPoint;
  const dt = (current.tMs - previous.tMs) / 1000;
  if (dt <= 0) return 0;
  return Math.abs(current.y - previous.y) / dt;
}

export interface DetectRepsOptions {
  /**
   * Where a rep begins. A squat and a bench start at the top and go down; a
   * deadlift and a row start at the bottom and pull up. Reps are counted
   * between successive turns of this kind.
   */
  readonly startsAt?: 'top' | 'bottom';
  /** Reversals smaller than this are not reps. */
  readonly minRangeM?: number;
  /**
   * A rep must also reach this fraction of the set's typical range.
   *
   * Set to 0 to take every reversal that clears `minRangeM` — which is what
   * this function used to do, and is right only when the path is known to be
   * clean. See `MIN_REP_RANGE_RATIO`.
   */
  readonly minRangeRatio?: number;
  /**
   * Reject a rep whose peak concentric velocity exceeds this, in m/s.
   *
   * `Infinity` accepts anything. See `MAX_REP_PEAK_VELOCITY_MS`.
   */
  readonly maxPeakVelocityMs?: number;
}

/**
 * Reps, from the vertical signal.
 *
 * Smooth the path before calling this. The threshold protects against tracker
 * jitter, not against differentiating raw noise.
 */
export function detectReps(path: readonly PathPoint[], options: DetectRepsOptions = {}): Rep[] {
  const startsAt = options.startsAt ?? 'top';
  const minRange = options.minRangeM ?? MIN_REP_RANGE_M;
  const minRatio = options.minRangeRatio ?? MIN_REP_RANGE_RATIO;
  const maxPeak = options.maxPeakVelocityMs ?? MAX_REP_PEAK_VELOCITY_MS;

  const turns = turningPoints(path, minRange / 2);
  // Indexed at the end, not here: a candidate rejected by the relative test
  // below must not leave a hole in the numbering, and every per-rep number in
  // the app is keyed on this index.
  const candidates: Omit<Rep, 'index'>[] = [];

  for (let i = 0; i + 2 < turns.length; i += 1) {
    const start = turns[i] as Turn;
    const turn = turns[i + 1] as Turn;
    const end = turns[i + 2] as Turn;
    if (start.kind !== startsAt || turn.kind === startsAt) continue;

    const romM = Math.abs(
      (path[turn.index] as PathPoint).y - (path[start.index] as PathPoint).y,
    );
    if (romM < minRange) continue;

    // TRIM THE REST OFF BOTH ENDS before anything is measured. `start` and
    // `end` are turning points, which sit in the middle of however long the
    // lifter rested; every duration and every velocity below is derived from
    // these indices, so trimming has to happen first.
    const { from, to } = settled(path, start.index, turn.index, end.index, romM);

    const startPoint = path[from] as PathPoint;
    const turnPoint = path[turn.index] as PathPoint;
    const endPoint = path[to] as PathPoint;

    // The concentric is whichever half travels upward.
    const [ascentFrom, ascentTo] = startsAt === 'top' ? [turn.index, to] : [from, turn.index];
    const { mean, peak } = concentricVelocity(path, ascentFrom, ascentTo);

    const firstHalfMs = turnPoint.tMs - startPoint.tMs;
    const secondHalfMs = endPoint.tMs - turnPoint.tMs;

    candidates.push({
      startMs: startPoint.tMs,
      turnMs: turnPoint.tMs,
      endMs: endPoint.tMs,
      romM,
      eccentricMs: startsAt === 'top' ? firstHalfMs : secondHalfMs,
      concentricMs: startsAt === 'top' ? secondHalfMs : firstHalfMs,
      meanConcentricVelocityMs: mean,
      peakConcentricVelocityMs: peak,
    });
  }

  // THE PHYSICAL TEST FIRST, and the order is not incidental. A candidate that
  // could not be a barbell must be gone BEFORE the group is measured, or it
  // joins the group it should have been excluded from and raises the floor for
  // the real reps. On the first real clip the two impossible candidates were
  // the two largest, so leaving them in set the reference from them.
  const possible = candidates.filter((candidate) => candidate.peakConcentricVelocityMs <= maxPeak);

  // THE RELATIVE TEST. A set's real reps resemble each other; a candidate far
  // below the group is something else that happened to reverse. Measured
  // against the group's median rather than the largest single excursion, so
  // one wild candidate cannot raise the bar for the genuine ones.
  const reference = repRangeReference(possible.map((candidate) => candidate.romM));
  const floor = reference === null ? 0 : reference * minRatio;

  return possible
    .filter((candidate) => candidate.romM >= floor)
    .map((candidate, index) => ({ index, ...candidate }));
}

/**
 * How much the bar slowed across the set, as a percentage of the best rep.
 *
 * The standard autoregulation cue: past roughly 20% the remaining reps cost
 * more fatigue than they buy adaptation. Measured against the fastest rep
 * rather than the first, because a first rep is often tentative and would
 * otherwise understate the drop.
 *
 * Null when there is nothing to compare — one rep, or a set with no upward
 * movement at all.
 */
export function velocityLossPercent(reps: readonly Rep[]): number | null {
  if (reps.length < 2) return null;

  const best = reps.reduce(
    (fastest, rep) =>
      rep.meanConcentricVelocityMs > fastest.meanConcentricVelocityMs ? rep : fastest,
    reps[0] as Rep,
  );
  const last = reps[reps.length - 1] as Rep;
  if (best.meanConcentricVelocityMs <= 0) return null;

  const loss = (1 - last.meanConcentricVelocityMs / best.meanConcentricVelocityMs) * 100;
  return Math.round(loss * 10) / 10;
}
