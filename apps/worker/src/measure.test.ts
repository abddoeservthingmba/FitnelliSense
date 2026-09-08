/**
 * The composition, tested. The arithmetic itself belongs to `@fi/domain` and is
 * covered there at 100% branch; what these tests defend is the ORDER and the
 * ARGUMENTS, which is all this package contributes and is where the mistakes
 * that actually happened were:
 *
 *   - measuring the set over the whole file instead of over the reps, which
 *     reported 1.12 m of range of motion on a 0.54 m deadlift
 *   - handing `detectReps` the wrong `startsAt`, which pairs the lowering of
 *     one rep with the pull of the next
 *   - calibrating from the plate's RADIUS as though it were the diameter,
 *     which halves every metre in the result
 */
import { describe, expect, it } from 'vitest';
import { measure, NotMeasurable } from './measure';
import type { BarPathPayload } from './analyser';

const FPS = 60;
/** 450 mm plate at 750 px/m: the scale measured on the first real clip. */
const PLATE_RADIUS_PX = 168.75;
const PX_PER_M = 750;

/**
 * A deadlift set as the analyzer would report it: floor, pull, hold, lower,
 * rest, in SOURCE pixels with y pointing DOWN.
 */
function deadliftPayload(options?: {
  reps?: number;
  romM?: number;
  restSecs?: number;
}): BarPathPayload {
  const reps = options?.reps ?? 3;
  const romPx = (options?.romM ?? 0.54) * PX_PER_M;
  const restSecs = options?.restSecs ?? 8;
  const floorY = 1430;

  const samples: [number, number, number][] = [];
  let frame = 0;
  const push = (y: number) => {
    samples.push([Math.round((frame / FPS) * 1000 * 1000) / 1000, 540, y]);
    frame += 1;
  };

  for (let r = 0; r < reps; r += 1) {
    for (let i = 0; i < FPS * 1; i += 1) {
      // Pull: one second, cosine.
      push(floorY - (romPx * (1 - Math.cos(Math.PI * (i / (FPS * 1))))) / 2);
    }
    for (let i = 0; i < FPS * 1.5; i += 1) push(floorY - romPx); // lockout hold
    for (let i = 0; i < FPS * 1.5; i += 1) {
      push(floorY - romPx + (romPx * (1 - Math.cos(Math.PI * (i / (FPS * 1.5))))) / 2);
    }
    // Rest on the floor, with the jitter a real centroid always has.
    for (let i = 0; i < FPS * restSecs; i += 1) push(floorY + Math.sin(i) * 3);
  }

  return {
    path_schema_version: '1.0.0',
    status: 'ok',
    reason: null,
    fps: FPS,
    frame_count: samples.length,
    width: 1080,
    height: 1920,
    plate_radius_px: PLATE_RADIUS_PX,
    quality: { coherence: 0.85, radius_spread: 1.4, travel_plate_radii: 4.4 },
    samples,
  };
}

describe('measure', () => {
  it('counts the reps in the set', () => {
    expect(measure(deadliftPayload({ reps: 3 }), 'deadlift').repCount).toBe(3);
  });

  it('reports range of motion in metres, from the plate', () => {
    // The whole point of the plate: a ratio of pixels means nothing, and
    // 0.54 m is a deadlift.
    const { result } = measure(deadliftPayload({ romM: 0.54 }), 'deadlift');
    expect(result.pixelsPerMetre).toBeCloseTo(PX_PER_M, 6);
    for (const rep of result.reps) expect(rep.romM).toBeCloseTo(0.54, 1);
  });

  it('doubles the radius before calibrating', () => {
    // Calibrating from the radius as though it were the diameter halves every
    // metre in the result, and every one of them stays plausible — which is
    // what makes it worth a test of its own.
    const { result } = measure(deadliftPayload(), 'deadlift');
    expect(result.pixelsPerMetre).toBeCloseTo(PLATE_RADIUS_PX * 2 * (1000 / 450), 6);
  });

  it('measures the set over the reps, not over the whole file', () => {
    // Eight seconds of rest between reps is in the file. It adds no range and
    // no drift, so a set measured over the reps is unchanged by how long the
    // lifter stood around — whereas measuring the whole clip picks up whatever
    // the tracker did while nothing was happening.
    const short = measure(deadliftPayload({ restSecs: 2 }), 'deadlift').result;
    const long = measure(deadliftPayload({ restSecs: 20 }), 'deadlift').result;
    expect(long.verticalRangeM).toBeCloseTo(short.verticalRangeM, 2);
    expect(long.reps.length).toBe(short.reps.length);
  });

  it('reports a deadlift as rising, not falling', () => {
    // `toMetres` flips y so up is positive. Getting that wrong inverts every
    // concentric in the app, and a negative velocity is the symptom.
    const { result } = measure(deadliftPayload(), 'deadlift');
    for (const rep of result.reps) {
      expect(rep.meanConcentricVelocityMs).toBeGreaterThan(0);
      expect(rep.peakConcentricVelocityMs).toBeGreaterThan(0);
    }
  });

  it('gives a concentric duration close to the pull, not the pull plus the rest', () => {
    // The pull is one second. Before the rep boundaries were trimmed this came
    // back at 4.69 s on the real clip, because the turning point that bounded
    // the rep sat in the middle of the rest before it.
    const { result } = measure(deadliftPayload(), 'deadlift');
    for (const rep of result.reps) {
      expect(rep.concentricMs).toBeLessThan(2000);
      expect(rep.concentricMs).toBeGreaterThan(500);
    }
  });

  it('publishes a result the wire contract accepts', () => {
    // `measure` parses its own output against `analysisResultSchema`, so this
    // asserts the parse happened rather than repeating it — a NaN or a missing
    // field would have thrown above.
    const { result } = measure(deadliftPayload(), 'deadlift');
    expect(Number.isFinite(result.straightness)).toBe(true);
    expect(result.straightness).toBeGreaterThan(0);
    expect(result.straightness).toBeLessThanOrEqual(1);
    expect(Number.isFinite(result.maxHorizontalDriftM)).toBe(true);
  });

  it('refuses a clip with no plate rather than inventing a scale', () => {
    const payload = { ...deadliftPayload(), plate_radius_px: null };
    expect(() => measure(payload, 'deadlift')).toThrow(NotMeasurable);
  });

  it('refuses a plate too small to measure against', () => {
    const payload = { ...deadliftPayload(), plate_radius_px: 0 };
    expect(() => measure(payload, 'deadlift')).toThrow(NotMeasurable);
  });

  it('refuses a path with no complete rep in it', () => {
    const payload: BarPathPayload = {
      ...deadliftPayload(),
      // A bar that sat still. Tracked perfectly, and not a set.
      samples: Array.from({ length: 600 }, (_, i) => [i * 16.667, 540, 1430]),
    };
    expect(() => measure(payload, 'deadlift')).toThrow(NotMeasurable);
  });

  it('says why it refused, in words a lifter can act on', () => {
    const payload = { ...deadliftPayload(), plate_radius_px: null };
    expect(() => measure(payload, 'deadlift')).toThrow(/plate/i);
  });

  it('reads a squat the other way up', () => {
    // The same trace, declared as a squat, must not produce a deadlift's reps:
    // a top-start lift pairs a different set of turning points. The assertion
    // is that the direction reaches `detectReps` at all — if it did not, both
    // would return the same thing.
    const payload = deadliftPayload({ reps: 3 });
    const asDeadlift = measure(payload, 'deadlift').repCount;
    let asSquat = 0;
    try {
      asSquat = measure(payload, 'back_squat').repCount;
    } catch (cause) {
      expect(cause).toBeInstanceOf(NotMeasurable);
    }
    expect(asSquat).not.toBe(asDeadlift);
  });
});
