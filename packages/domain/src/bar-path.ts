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

export interface DetectRepsOptions {
  /**
   * Where a rep begins. A squat and a bench start at the top and go down; a
   * deadlift and a row start at the bottom and pull up. Reps are counted
   * between successive turns of this kind.
   */
  readonly startsAt?: 'top' | 'bottom';
  /** Reversals smaller than this are not reps. */
  readonly minRangeM?: number;
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

  const turns = turningPoints(path, minRange / 2);
  const reps: Rep[] = [];

  for (let i = 0; i + 2 < turns.length; i += 1) {
    const start = turns[i] as Turn;
    const turn = turns[i + 1] as Turn;
    const end = turns[i + 2] as Turn;
    if (start.kind !== startsAt || turn.kind === startsAt) continue;

    const startPoint = path[start.index] as PathPoint;
    const turnPoint = path[turn.index] as PathPoint;
    const endPoint = path[end.index] as PathPoint;

    const romM = Math.abs(turnPoint.y - startPoint.y);
    if (romM < minRange) continue;

    // The concentric is whichever half travels upward.
    const [ascentFrom, ascentTo] =
      startsAt === 'top' ? [turn.index, end.index] : [start.index, turn.index];
    const { mean, peak } = concentricVelocity(path, ascentFrom, ascentTo);

    const firstHalfMs = turnPoint.tMs - startPoint.tMs;
    const secondHalfMs = endPoint.tMs - turnPoint.tMs;

    reps.push({
      index: reps.length,
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

  return reps;
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
