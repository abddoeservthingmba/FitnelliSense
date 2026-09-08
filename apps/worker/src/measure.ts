/**
 * Turning a bar path into the result the API publishes.
 *
 * EVERY NUMBER HERE COMES FROM `@fi/domain`. Nothing in this file computes a
 * metre, a velocity or a rep — it composes functions that are unit-tested at
 * 100% branch coverage and calls them in the right order with the right
 * arguments. That ordering is the only thing this module owns, and it is worth
 * owning in one place because two of the steps are easy to get wrong:
 *
 *   - SMOOTH BEFORE MEASURING. Velocity is a derivative, and differentiating
 *     raw tracker output produces spikes that dwarf the signal.
 *   - MEASURE THE SET-LEVEL METRICS OVER THE REPS, NOT THE WHOLE FILE. A clip
 *     contains the lifter walking up, setting up and walking away. Measured
 *     over all of it, the first real clip reported 1.12 m of range of motion
 *     and 0.85 m of bar drift — both of them the tracker wandering rather than
 *     the barbell, and both wrong by more than a factor of two.
 */
import {
  barPathMetrics,
  calibrationFromPlate,
  detectReps,
  repStartsAt,
  smoothPath,
  toMetres,
  velocityLossPercent,
  type AnalyserExercise,
  type PathPoint,
} from '@fi/domain';
import { analysisResultSchema, type AnalysisResult } from '@fi/shared';
import type { BarPathPayload } from './analyser';

export class NotMeasurable extends Error {}

/**
 * The result for one clip.
 *
 * Throws `NotMeasurable` with a message fit for a user rather than returning a
 * half-populated result. The wire contract's numbers are all non-nullable, and
 * that is the right shape: a range of motion of zero and "we could not measure
 * your range of motion" are different claims, and only one of them is true.
 */
export function measure(payload: BarPathPayload, exercise: AnalyserExercise): {
  result: AnalysisResult;
  repCount: number;
} {
  if (payload.plate_radius_px === null) {
    throw new NotMeasurable('We could not find the plate, so there was nothing to measure against');
  }

  // THE PLATE IS THE RULER. A competition plate is 450 mm across whatever the
  // camera did, so it is the one object in frame whose size is known — and
  // without it every number below would be in pixels, which change with how
  // far away the phone was and are therefore a measurement of nothing.
  const pixelsPerMetre = calibrationFromPlate(payload.plate_radius_px * 2);
  if (pixelsPerMetre === null) {
    throw new NotMeasurable('The plate was too small in frame to measure against');
  }

  const path = smoothPath(
    toMetres(
      payload.samples.map(([tMs, x, y]) => ({ tMs, x, y })),
      pixelsPerMetre,
    ),
  );

  const reps = detectReps(path, { startsAt: repStartsAt(exercise) });
  // One check, narrowing both ends at once. `reps.length === 0` followed by
  // non-null assertions would say the same thing to a reader and nothing at
  // all to the compiler.
  const [first] = reps;
  const last = reps.at(-1);
  if (first === undefined || last === undefined) {
    throw new NotMeasurable('We followed the bar but could not find a complete rep');
  }

  const metrics = barPathMetrics(liftedSpan(path, first.startMs, last.endMs));

  return {
    repCount: reps.length,
    result: analysisResultSchema.parse({
      reps: reps.map((rep) => ({
        index: rep.index,
        romM: rep.romM,
        concentricMs: Math.round(rep.concentricMs),
        eccentricMs: Math.round(rep.eccentricMs),
        meanConcentricVelocityMs: rep.meanConcentricVelocityMs,
        peakConcentricVelocityMs: rep.peakConcentricVelocityMs,
      })),
      verticalRangeM: metrics.verticalRangeM,
      maxHorizontalDriftM: metrics.maxHorizontalDriftM,
      straightness: metrics.straightness,
      velocityLossPercent: velocityLossPercent(reps),
      pixelsPerMetre,
    } satisfies AnalysisResult),
  };
}

/**
 * The part of the path that is the actual lifting.
 *
 * From the first rep's start to the last rep's end. Not a per-rep union: the
 * rest between reps belongs in here, because a bar left on the floor adds
 * nothing to a range or a drift and excluding it would make `pathLengthM`
 * discontinuous — the jump from one rep's end to the next rep's start would be
 * counted as travel the bar never made.
 */
function liftedSpan(path: readonly PathPoint[], fromMs: number, toMs: number): PathPoint[] {
  return path.filter((point) => point.tMs >= fromMs && point.tMs <= toMs);
}
