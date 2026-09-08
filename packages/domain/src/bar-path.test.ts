import { describe, expect, it } from 'vitest';
import {
  MIN_REP_RANGE_M,
  PLATE_DIAMETER_MM,
  barPathMetrics,
  calibrationFromPlate,
  detectReps,
  repRangeReference,
  smoothPath,
  toMetres,
  velocityLossPercent,
  type PathPoint,
  type PixelSample,
} from './bar-path';

/**
 * A synthetic set, sampled at 30 fps.
 *
 * `y` follows a cosine, which is what a barbell actually traces: it starts at
 * an extreme, reverses smoothly and comes back. A triangle wave would be
 * kinder to the rep detector than reality is.
 */
function syntheticSet(options: {
  reps: number;
  romM: number;
  secondsPerRep: number;
  startsAtTop?: boolean;
  driftM?: number;
  fps?: number;
}): PathPoint[] {
  const { reps, romM, secondsPerRep, startsAtTop = true, driftM = 0, fps = 30 } = options;
  const total = Math.round(reps * secondsPerRep * fps);
  const amplitude = romM / 2;

  return Array.from({ length: total + 1 }, (_, i) => {
    const seconds = i / fps;
    const phase = (2 * Math.PI * seconds) / secondsPerRep;
    // Top-start lifts descend first, so the cosine begins at its maximum.
    const y = startsAtTop ? amplitude * Math.cos(phase) : -amplitude * Math.cos(phase);
    return { tMs: Math.round(seconds * 1000), x: (driftM * seconds) / secondsPerRep, y };
  });
}

describe('calibrationFromPlate', () => {
  it('converts a plate measured in pixels to a scale', () => {
    // A 450 mm plate spanning 90 px means 200 px per metre.
    expect(calibrationFromPlate(90)).toBeCloseTo(200, 6);
  });

  it('accepts a non-standard plate', () => {
    expect(calibrationFromPlate(100, 500)).toBeCloseTo(200, 6);
  });

  it('reports an unusable measurement rather than throwing', () => {
    // The tracker failing to find the plate is a normal outcome, not an error.
    expect(calibrationFromPlate(0)).toBeNull();
    expect(calibrationFromPlate(-5)).toBeNull();
    expect(calibrationFromPlate(Number.NaN)).toBeNull();
    expect(calibrationFromPlate(90, 0)).toBeNull();
    expect(calibrationFromPlate(90, Number.NaN)).toBeNull();
  });

  it('uses a competition plate by default', () => {
    expect(PLATE_DIAMETER_MM).toBe(450);
  });
});

describe('toMetres', () => {
  const samples: PixelSample[] = [
    { tMs: 0, x: 100, y: 500 },
    { tMs: 33, x: 100, y: 400 },
    { tMs: 66, x: 110, y: 300 },
  ];

  it('flips y so that up is positive', () => {
    // Image y falls from 500 to 300 — the bar went UP by 200 px.
    const path = toMetres(samples, 100);
    expect(path[1]?.y).toBeCloseTo(1, 6);
    expect(path[2]?.y).toBeCloseTo(2, 6);
  });

  it('puts the origin at the first sample', () => {
    const path = toMetres(samples, 100);
    expect(path[0]).toEqual({ tMs: 0, x: 0, y: 0 });
  });

  it('rebases time on the first sample', () => {
    const path = toMetres(
      [
        { tMs: 5000, x: 0, y: 0 },
        { tMs: 5033, x: 0, y: -100 },
      ],
      100,
    );
    expect(path[0]?.tMs).toBe(0);
    expect(path[1]?.tMs).toBe(33);
  });

  it('converts horizontal drift too', () => {
    expect(toMetres(samples, 100)[2]?.x).toBeCloseTo(0.1, 6);
  });

  it('drops samples whose timestamps do not advance', () => {
    // Trackers repeat and reorder frames. A zero interval would divide into
    // every velocity computed downstream.
    const path = toMetres(
      [
        { tMs: 0, x: 0, y: 0 },
        { tMs: 33, x: 0, y: -10 },
        { tMs: 33, x: 0, y: -20 },
        { tMs: 20, x: 0, y: -30 },
        { tMs: 66, x: 0, y: -40 },
      ],
      100,
    );
    expect(path.map((point) => point.tMs)).toEqual([0, 33, 66]);
  });

  it('drops samples that are not finite', () => {
    const path = toMetres(
      [
        { tMs: 0, x: 0, y: 0 },
        { tMs: 33, x: Number.NaN, y: 10 },
        { tMs: 66, x: 0, y: Number.POSITIVE_INFINITY },
        { tMs: 99, x: Number.NaN, y: 0 },
        { tMs: 132, x: 0, y: -100 },
      ],
      100,
    );
    expect(path).toHaveLength(2);
  });

  it('is empty without a usable scale', () => {
    expect(toMetres(samples, 0)).toEqual([]);
    expect(toMetres(samples, -1)).toEqual([]);
    expect(toMetres(samples, Number.NaN)).toEqual([]);
  });

  it('is empty for no samples, and for nothing but unusable ones', () => {
    expect(toMetres([], 100)).toEqual([]);
    expect(toMetres([{ tMs: Number.NaN, x: 0, y: 0 }], 100)).toEqual([]);
  });
});

describe('smoothPath', () => {
  it('flattens single-sample jitter', () => {
    const spiky: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 33, x: 0, y: 1 },
      { tMs: 66, x: 0, y: 0 },
    ];
    // Differentiating that spike would report a metre per frame.
    expect(smoothPath(spiky, 3)[1]?.y).toBeCloseTo(1 / 3, 6);
  });

  it('keeps timestamps untouched', () => {
    const path = syntheticSet({ reps: 1, romM: 0.5, secondsPerRep: 2 });
    expect(smoothPath(path).map((point) => point.tMs)).toEqual(path.map((point) => point.tMs));
  });

  it('narrows the window at the ends rather than padding', () => {
    // Padding would drag the first and last samples toward the middle and
    // silently shorten the range of motion.
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 10 },
      { tMs: 33, x: 0, y: 10 },
      { tMs: 66, x: 0, y: 10 },
    ];
    expect(smoothPath(path, 3)[0]?.y).toBe(10);
  });

  it('smooths x as well as y', () => {
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 33, x: 3, y: 0 },
      { tMs: 66, x: 0, y: 0 },
    ];
    expect(smoothPath(path, 3)[1]?.x).toBeCloseTo(1, 6);
  });

  it('returns the path unchanged for a window of one', () => {
    const path = syntheticSet({ reps: 1, romM: 0.5, secondsPerRep: 2 });
    expect(smoothPath(path, 1)).toEqual(path);
    expect(smoothPath(path, 0)).toEqual(path);
  });

  it('is empty for an empty path', () => {
    expect(smoothPath([])).toEqual([]);
  });
});

describe('barPathMetrics', () => {
  it('measures range of motion from the extremes', () => {
    const path = syntheticSet({ reps: 1, romM: 0.5, secondsPerRep: 2 });
    expect(barPathMetrics(path).verticalRangeM).toBeCloseTo(0.5, 2);
  });

  it('scores a perfectly vertical bar as straight', () => {
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 33, x: 0, y: -0.3 },
      { tMs: 66, x: 0, y: 0 },
    ];
    expect(barPathMetrics(path).straightness).toBeCloseTo(1, 6);
    expect(barPathMetrics(path).maxHorizontalDriftM).toBe(0);
  });

  it('scores a drifting bar below one', () => {
    const straight = barPathMetrics(syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 2 }));
    const drifting = barPathMetrics(
      syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 2, driftM: 0.15 }),
    );
    expect(drifting.straightness).toBeLessThan(straight.straightness);
    expect(drifting.maxHorizontalDriftM).toBeGreaterThan(0.1);
  });

  it('reports drift as distance from the start, in either direction', () => {
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 33, x: -0.08, y: 0.2 },
      { tMs: 66, x: 0.03, y: 0.4 },
    ];
    expect(barPathMetrics(path).maxHorizontalDriftM).toBeCloseTo(0.08, 6);
  });

  it('measures total travel including the wander', () => {
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 33, x: 3, y: 4 },
    ];
    expect(barPathMetrics(path).pathLengthM).toBeCloseTo(5, 6);
  });

  it('scores a bar that never moved as zero rather than NaN', () => {
    const path: PathPoint[] = [
      { tMs: 0, x: 1, y: 1 },
      { tMs: 33, x: 1, y: 1 },
    ];
    const metrics = barPathMetrics(path);
    expect(metrics.straightness).toBe(0);
    expect(metrics.pathLengthM).toBe(0);
  });

  it('is all zeroes for an empty path', () => {
    expect(barPathMetrics([])).toEqual({
      verticalRangeM: 0,
      maxHorizontalDriftM: 0,
      pathLengthM: 0,
      straightness: 0,
    });
  });
});

describe('detectReps', () => {
  it('counts reps in a set that starts at the top', () => {
    const path = syntheticSet({ reps: 5, romM: 0.5, secondsPerRep: 3 });
    expect(detectReps(path)).toHaveLength(5);
  });

  it('counts reps in a set that starts at the bottom', () => {
    // A deadlift begins on the floor and pulls up, so the turns run the other
    // way round. Counting from the top would find one fewer rep.
    const path = syntheticSet({ reps: 4, romM: 0.6, secondsPerRep: 3, startsAtTop: false });
    expect(detectReps(path, { startsAt: 'bottom' })).toHaveLength(4);
  });

  it('measures range of motion per rep', () => {
    const path = syntheticSet({ reps: 3, romM: 0.5, secondsPerRep: 3 });
    for (const rep of detectReps(path)) {
      expect(rep.romM).toBeCloseTo(0.5, 2);
    }
  });

  it('splits eccentric from concentric', () => {
    const path = syntheticSet({ reps: 3, romM: 0.5, secondsPerRep: 4 });
    const rep = detectReps(path)[0];

    // A symmetric cosine spends half the rep going each way, and the two
    // halves must come out EQUAL — that is the property worth asserting,
    // because an asymmetry here would mean the direction convention is wrong.
    expect(rep?.eccentricMs).toBe(rep?.concentricMs);

    // Just under half of 4000 ms, not exactly half, and deliberately so. The
    // boundaries are now trimmed to where the bar is actually moving, and
    // either side of a cosine turnaround it is not: 67 ms at each end sits
    // below 8% of the rep's peak speed. Excluding that from the durations is
    // the point of the trim — it is what stops eight seconds of a barbell
    // lying on the floor being reported as an eccentric. On a clip with no
    // rest in it there is nothing to remove but the turnaround itself.
    expect(rep?.eccentricMs).toBeGreaterThan(1900);
    expect(rep?.eccentricMs).toBeLessThanOrEqual(2000);
  });

  it('leaves the rest between reps out of the rep', () => {
    // The defect this trimming exists to fix, measured on the first real clip:
    // a deadlift whose pull took 0.9 s and whose lowering took 1.5 s came back
    // with a 4.69 s concentric and a 10.49 s eccentric, because the eight
    // seconds the bar spent on the floor between reps belonged to the reps
    // either side of it. A turning point sits in the MIDDLE of a rest, so a
    // rep bounded by turning points contains half a rest at each end.
    const perRep = 60; // 2 s of movement at 30 fps
    const rest = 240; // 8 s of the bar on the floor
    const path: PathPoint[] = [];
    let tMs = 0;
    for (let r = 0; r < 3; r += 1) {
      for (let i = 0; i < perRep; i += 1) {
        const u = i / perRep;
        path.push({ tMs, x: 0, y: (0.5 * (1 - Math.cos(2 * Math.PI * u))) / 2 });
        tMs += 1000 / 30;
      }
      for (let i = 0; i < rest; i += 1) {
        // Not perfectly still: a tracked centroid never is, and it is exactly
        // this jitter that defeats a plain velocity test.
        path.push({ tMs, x: 0, y: Math.sin(i) * 0.004 });
        tMs += 1000 / 30;
      }
    }

    const reps = detectReps(path, { startsAt: 'bottom' });
    expect(reps.length).toBeGreaterThan(0);
    for (const rep of reps) {
      // The movement is 2 s. Without trimming each rep ran to about 10 s.
      expect(rep.endMs - rep.startMs).toBeLessThan(3000);
    }
  });

  it('rejects an excursion far below the typical range of the set', () => {
    // Eleven of the fourteen "reps" found in the first real clip were the
    // tracker holding the lifter's back while he walked around. They cleared
    // the absolute minimum comfortably — 15 cm to 72 cm — because a shoulder
    // moves further than 10 cm. What separates them is that real reps of one
    // set resemble each other.
    const real = syntheticSet({ reps: 3, romM: 0.5, secondsPerRep: 3 });
    const shrug = syntheticSet({ reps: 2, romM: 0.15, secondsPerRep: 3 }).map((point) => ({
      ...point,
      tMs: point.tMs + 9000,
    }));

    const kept = detectReps([...real, ...shrug]);
    // Asserted as a property rather than a count: joining two synthetic sets
    // leaves a seam between them that is itself a reversal, and pinning the
    // number would be pinning that artefact rather than the rejection.
    for (const rep of kept) expect(rep.romM).toBeGreaterThan(0.3);

    // With the relative test switched off, the shallow pair comes back.
    const all = detectReps([...real, ...shrug], { minRangeRatio: 0 });
    expect(all.length).toBeGreaterThan(kept.length);
    expect(all.some((rep) => rep.romM < 0.2)).toBe(true);
  });

  it('rejects a rep no barbell could have performed', () => {
    // 0.5 m in 100 ms is 5 m/s. The fastest bar speed in sport is the second
    // pull of a snatch at roughly 2 m/s, so this is not a lift — it is the
    // tracker jumping between two objects.
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 50, x: 0, y: 0.25 },
      { tMs: 100, x: 0, y: 0.5 },
      { tMs: 150, x: 0, y: 0.25 },
      { tMs: 200, x: 0, y: 0 },
    ];
    expect(detectReps(path, { startsAt: 'bottom' })).toEqual([]);
    expect(
      detectReps(path, { startsAt: 'bottom', maxPeakVelocityMs: Infinity }).length,
    ).toBeGreaterThan(0);
  });

  it('survives a tracker that stalls mid-lift', () => {
    // A real tracker repeats and reorders frames. An interval of zero inside
    // the ascent would divide into the peak velocity and put Infinity on the
    // screen, so it is skipped rather than trusted.
    const stalled = syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 3 }).map((point, index) =>
      index % 17 === 0 && index > 0
        ? { ...point, tMs: Math.round(((index - 1) / 30) * 1000) }
        : point,
    );

    const reps = detectReps(stalled);
    expect(reps.length).toBeGreaterThan(0);
    for (const rep of reps) {
      expect(Number.isFinite(rep.peakConcentricVelocityMs)).toBe(true);
      expect(Number.isFinite(rep.meanConcentricVelocityMs)).toBe(true);
    }
  });

  it('numbers the reps that survive contiguously from zero', () => {
    // A rejected candidate must not leave a hole: every per-rep number in the
    // app is keyed on this index.
    const real = syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 3 });
    const shrug = syntheticSet({ reps: 1, romM: 0.15, secondsPerRep: 3 }).map((point) => ({
      ...point,
      tMs: point.tMs + 6000,
    }));
    const tail = syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 3 }).map((point) => ({
      ...point,
      tMs: point.tMs + 9000,
    }));

    const reps = detectReps([...real, ...shrug, ...tail]);
    expect(reps.map((rep) => rep.index)).toEqual(reps.map((_, index) => index));
  });

  it('has no range reference to compare against when nothing moved', () => {
    expect(repRangeReference([])).toBeNull();
    expect(repRangeReference([0, -1, Number.NaN])).toBeNull();
    expect(repRangeReference([0.5, 0.5, 0.1])).toBeCloseTo(0.5, 6);
    // Even count: the median is the midpoint of the two middle values.
    expect(repRangeReference([0.4, 0.6])).toBeCloseTo(0.5, 6);
  });

  it('reports concentric velocity as a positive number', () => {
    // The direction convention is the thing most likely to be wrong: a rep
    // that lifts the bar must not report a negative velocity.
    const path = syntheticSet({ reps: 3, romM: 0.5, secondsPerRep: 2 });
    for (const rep of detectReps(path)) {
      expect(rep.meanConcentricVelocityMs).toBeGreaterThan(0);
      expect(rep.peakConcentricVelocityMs).toBeGreaterThan(rep.meanConcentricVelocityMs);
    }
  });

  it('reports concentric velocity as positive for a bottom-start lift too', () => {
    const path = syntheticSet({ reps: 3, romM: 0.6, secondsPerRep: 2, startsAtTop: false });
    for (const rep of detectReps(path, { startsAt: 'bottom' })) {
      expect(rep.meanConcentricVelocityMs).toBeGreaterThan(0);
    }
  });

  it('computes mean concentric velocity as range over time', () => {
    const path = syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 4 });
    // 0.5 m lifted over the 2 s concentric half.
    expect(detectReps(path)[0]?.meanConcentricVelocityMs).toBeCloseTo(0.25, 1);
  });

  it('numbers reps from zero, in order', () => {
    const reps = detectReps(syntheticSet({ reps: 4, romM: 0.5, secondsPerRep: 3 }));
    expect(reps.map((rep) => rep.index)).toEqual([0, 1, 2, 3]);
    expect(reps[1]?.startMs).toBeGreaterThan(reps[0]?.startMs ?? 0);
  });

  it('ignores jitter that never amounts to a rep', () => {
    // Half a centimetre of tracker noise for ten seconds is not thirty reps.
    const noise: PathPoint[] = Array.from({ length: 300 }, (_, i) => ({
      tMs: i * 33,
      x: 0,
      y: Math.sin(i) * 0.005,
    }));
    expect(detectReps(noise)).toEqual([]);
  });

  it('ignores a reversal shallower than the minimum', () => {
    const shallow = syntheticSet({ reps: 3, romM: 0.05, secondsPerRep: 3 });
    expect(detectReps(shallow)).toEqual([]);
  });

  it('honours a custom minimum range', () => {
    const shallow = syntheticSet({ reps: 3, romM: 0.08, secondsPerRep: 3 });
    expect(detectReps(shallow)).toEqual([]);
    expect(detectReps(shallow, { minRangeM: 0.02 })).toHaveLength(3);
  });

  it('defaults the minimum to a tenth of a metre', () => {
    expect(MIN_REP_RANGE_M).toBe(0.1);
  });

  it('finds nothing in a path too short to turn', () => {
    expect(detectReps([])).toEqual([]);
    expect(detectReps([{ tMs: 0, x: 0, y: 0 }])).toEqual([]);
    expect(
      detectReps([
        { tMs: 0, x: 0, y: 0 },
        { tMs: 33, x: 0, y: 0.5 },
      ]),
    ).toEqual([]);
  });

  it('tolerates a small wobble before the first real movement', () => {
    // Someone settling under the bar before they descend. The wobble must not
    // be mistaken for the top of the first rep.
    const settle: PathPoint[] = [
      { tMs: 0, x: 0, y: 0 },
      { tMs: 33, x: 0, y: 0.01 },
      { tMs: 66, x: 0, y: 0.02 },
      { tMs: 99, x: 0, y: 0.01 },
    ];
    const lift = syntheticSet({ reps: 2, romM: 0.5, secondsPerRep: 3 }).map((point) => ({
      ...point,
      tMs: point.tMs + 132,
    }));
    expect(detectReps([...settle, ...lift])).toHaveLength(2);
  });

  it('handles a rep with no time between turns', () => {
    // Degenerate, but a tracker that stalls can produce it, and a division by
    // zero here would put Infinity on the screen.
    const path: PathPoint[] = [
      { tMs: 0, x: 0, y: 0.5 },
      { tMs: 100, x: 0, y: 0 },
      { tMs: 100, x: 0, y: 0.5 },
    ];
    for (const rep of detectReps(path)) {
      expect(Number.isFinite(rep.meanConcentricVelocityMs)).toBe(true);
      expect(Number.isFinite(rep.peakConcentricVelocityMs)).toBe(true);
    }
  });
});

describe('velocityLossPercent', () => {
  const rep = (index: number, velocity: number) => ({
    index,
    startMs: index * 1000,
    turnMs: index * 1000 + 400,
    endMs: index * 1000 + 800,
    romM: 0.5,
    eccentricMs: 400,
    concentricMs: 400,
    meanConcentricVelocityMs: velocity,
    peakConcentricVelocityMs: velocity * 1.4,
  });

  it('measures the drop from the fastest rep to the last', () => {
    expect(velocityLossPercent([rep(0, 0.5), rep(1, 0.45), rep(2, 0.4)])).toBe(20);
  });

  it('measures against the fastest rep, not the first', () => {
    // A tentative opener would otherwise understate the fatigue.
    expect(velocityLossPercent([rep(0, 0.4), rep(1, 0.5), rep(2, 0.25)])).toBe(50);
  });

  it('rounds to one decimal place', () => {
    expect(velocityLossPercent([rep(0, 0.3), rep(1, 0.2)])).toBe(33.3);
  });

  it('reports no loss when the last rep was the fastest', () => {
    // Speeding up through a set is real — a warmup finding its groove. Because
    // the reference IS the fastest rep, that set reads as 0% rather than as a
    // negative number, which is the standard definition and keeps the figure
    // meaning one thing: how far off your best you finished.
    expect(velocityLossPercent([rep(0, 0.4), rep(1, 0.5)])).toBe(0);
  });

  it('has nothing to compare with fewer than two reps', () => {
    expect(velocityLossPercent([])).toBeNull();
    expect(velocityLossPercent([rep(0, 0.5)])).toBeNull();
  });

  it('has nothing to compare when the bar never went up', () => {
    expect(velocityLossPercent([rep(0, 0), rep(1, 0)])).toBeNull();
    expect(velocityLossPercent([rep(0, -0.1), rep(1, -0.2)])).toBeNull();
  });
});

describe('the whole pipeline', () => {
  it('turns pixel samples into reps', () => {
    // 200 px per metre, 0.5 m range, four reps at three seconds each, with the
    // bar drifting forward — a full pass through every stage.
    const metres = syntheticSet({ reps: 4, romM: 0.5, secondsPerRep: 3, driftM: 0.1 });
    const pixels: PixelSample[] = metres.map((point) => ({
      tMs: point.tMs,
      x: 100 + point.x * 200,
      // Back to image coordinates, y pointing down, plus a pixel of jitter.
      y: 500 - point.y * 200 + (point.tMs % 2 === 0 ? 1 : -1),
    }));

    const scale = calibrationFromPlate(90);
    expect(scale).toBe(200);

    const path = smoothPath(toMetres(pixels, scale ?? 1));
    const reps = detectReps(path);

    expect(reps).toHaveLength(4);
    expect(barPathMetrics(path).verticalRangeM).toBeCloseTo(0.5, 1);
    expect(barPathMetrics(path).straightness).toBeGreaterThan(0.8);
    expect(velocityLossPercent(reps)).not.toBeNull();
  });
});
