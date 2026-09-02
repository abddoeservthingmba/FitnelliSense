import { describe, expect, it } from 'vitest';
import { dec, decToString } from './decimal';
import {
  MIN_VOLUME_FOR_PERCENT_KG,
  compareMuscleWork,
  muscleWork,
  muscleWorkToWire,
  volumeShare,
  type AttributedWork,
  type MuscleWork,
} from './muscle-work';

function work(groups: string[], volume: number, workoutId = 'w1'): AttributedWork {
  return { primaryGroups: groups, volumeKg: dec(volume), workoutId };
}

describe('muscleWork', () => {
  it('totals volume, sets and sessions per group', () => {
    const result = muscleWork([
      work(['chest'], 1000, 'w1'),
      work(['chest'], 1200, 'w1'),
      work(['chest'], 900, 'w2'),
      work(['back'], 800, 'w2'),
    ]);

    const chest = result.find((item) => item.group === 'chest');
    expect(decToString(chest?.volumeKg ?? dec(0))).toBe('3100.00');
    expect(chest?.sets).toBe(3);
    // Two sessions, not three sets.
    expect(chest?.workouts).toBe(2);
  });

  it('splits volume equally between an exercise’s primary groups', () => {
    // 1000 kg across two primaries is 500 each, so the group totals still add
    // up to the session's real volume rather than double-counting to 2000.
    const result = muscleWork([work(['chest', 'shoulders'], 1000)]);
    expect(decToString(result[0]?.volumeKg ?? dec(0))).toBe('500.00');
    expect(decToString(result[1]?.volumeKg ?? dec(0))).toBe('500.00');

    const total = result.reduce((sum, item) => sum + Number(decToString(item.volumeKg)), 0);
    expect(total).toBe(1000);
  });

  it('counts a set once per group it is attributed to', () => {
    const result = muscleWork([work(['chest', 'shoulders'], 1000)]);
    expect(result.every((item) => item.sets === 1)).toBe(true);
  });

  it('drops a set with no primary group rather than inventing a bucket', () => {
    const result = muscleWork([work([], 1000), work(['chest'], 500)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.group).toBe('chest');
  });

  it('is sorted heaviest first, because that is the question being asked', () => {
    const result = muscleWork([work(['arms'], 400), work(['legs'], 5000), work(['chest'], 2000)]);
    expect(result.map((item) => item.group)).toEqual(['legs', 'chest', 'arms']);
  });

  it('omits untrained groups rather than showing them as zero', () => {
    // The caller knows the full taxonomy and can decide whether an untrained
    // group deserves a row; inventing one here forces that on everyone.
    expect(muscleWork([work(['chest'], 1000)])).toHaveLength(1);
  });

  it('is empty for no work', () => {
    expect(muscleWork([])).toEqual([]);
  });
});

describe('compareMuscleWork', () => {
  const current: MuscleWork[] = [
    { group: 'chest', volumeKg: dec(6000), sets: 24, workouts: 4 },
    { group: 'back', volumeKg: dec(4000), sets: 18, workouts: 3 },
  ];
  const previous: MuscleWork[] = [
    { group: 'chest', volumeKg: dec(5000), sets: 20, workouts: 4 },
    { group: 'legs', volumeKg: dec(3000), sets: 12, workouts: 2 },
  ];

  it('reports growth as a percentage and an absolute change', () => {
    const chest = compareMuscleWork(current, previous).find((c) => c.group === 'chest');
    expect(decToString(chest?.deltaVolumeKg ?? dec(0))).toBe('1000.00');
    expect(chest?.changePercent).toBe(20);
    expect(chest?.currentSets).toBe(24);
    expect(chest?.previousSets).toBe(20);
  });

  it('shows a group that was dropped as a fall, not as absent', () => {
    // This is the case the comparison exists for: legs trained last month,
    // untouched this month. Vanishing from the list would hide it.
    const legs = compareMuscleWork(current, previous).find((c) => c.group === 'legs');
    expect(legs).toBeDefined();
    expect(decToString(legs?.currentVolumeKg ?? dec(1))).toBe('0.00');
    expect(decToString(legs?.deltaVolumeKg ?? dec(0))).toBe('-3000.00');
    expect(legs?.changePercent).toBe(-100);
  });

  it('shows a newly trained group with no percentage', () => {
    // Back has no previous volume. "+Infinity%" is not a figure, and "+100%"
    // would be a lie — so the percentage is withheld and the absolute stands.
    const back = compareMuscleWork(current, previous).find((c) => c.group === 'back');
    expect(back?.changePercent).toBeNull();
    expect(decToString(back?.deltaVolumeKg ?? dec(0))).toBe('4000.00');
  });

  it('withholds a percentage when the base is too small to be meaningful', () => {
    // 100 kg to 5000 kg is "+4900%", true and useless.
    const tiny = compareMuscleWork(
      [{ group: 'arms', volumeKg: dec(5000), sets: 20, workouts: 4 }],
      [{ group: 'arms', volumeKg: dec(100), sets: 2, workouts: 1 }],
    );
    expect(tiny[0]?.changePercent).toBeNull();
    expect(decToString(tiny[0]?.deltaVolumeKg ?? dec(0))).toBe('4900.00');
  });

  it('quotes a percentage exactly at the threshold', () => {
    const atFloor = compareMuscleWork(
      [{ group: 'arms', volumeKg: dec(1000), sets: 8, workouts: 2 }],
      [
        {
          group: 'arms',
          volumeKg: dec(MIN_VOLUME_FOR_PERCENT_KG),
          sets: 4,
          workouts: 1,
        },
      ],
    );
    expect(atFloor[0]?.changePercent).toBe(100);
  });

  it('reports one decimal place, not fifteen', () => {
    const awkward = compareMuscleWork(
      [{ group: 'chest', volumeKg: dec(1234), sets: 8, workouts: 2 }],
      [{ group: 'chest', volumeKg: dec(1000), sets: 8, workouts: 2 }],
    );
    expect(awkward[0]?.changePercent).toBe(23.4);
  });

  it('sorts by current volume, so this month leads', () => {
    const compared = compareMuscleWork(current, previous);
    expect(compared.map((c) => c.group)).toEqual(['chest', 'back', 'legs']);
  });

  it('handles both windows being empty', () => {
    expect(compareMuscleWork([], [])).toEqual([]);
  });
});

describe('volumeShare', () => {
  it('gives each group its percentage of the total', () => {
    const share = volumeShare([
      { group: 'chest', volumeKg: dec(5000), sets: 20, workouts: 4 },
      { group: 'back', volumeKg: dec(3000), sets: 12, workouts: 3 },
      { group: 'legs', volumeKg: dec(2000), sets: 8, workouts: 2 },
    ]);
    expect(share).toEqual([
      { group: 'chest', percent: 50 },
      { group: 'back', percent: 30 },
      { group: 'legs', percent: 20 },
    ]);
  });

  it('sums to about 100', () => {
    const share = volumeShare([
      { group: 'a', volumeKg: dec(1), sets: 1, workouts: 1 },
      { group: 'b', volumeKg: dec(1), sets: 1, workouts: 1 },
      { group: 'c', volumeKg: dec(1), sets: 1, workouts: 1 },
    ]);
    const total = share.reduce((sum, item) => sum + item.percent, 0);
    // Thirds do not divide cleanly; a rounding step of 0.1 is the tolerance.
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.3);
  });

  it('returns zeroes rather than dividing by zero', () => {
    const share = volumeShare([{ group: 'chest', volumeKg: dec(0), sets: 0, workouts: 0 }]);
    expect(share).toEqual([{ group: 'chest', percent: 0 }]);
  });

  it('is empty for no work', () => {
    expect(volumeShare([])).toEqual([]);
  });
});

describe('muscleWorkToWire', () => {
  it('renders a decimal string, matching the shared schema', () => {
    expect(
      muscleWorkToWire({ group: 'chest', volumeKg: dec(3100), sets: 12, workouts: 3 }),
    ).toEqual({ group: 'chest', volumeKg: '3100.00', sets: 12, workouts: 3 });
  });
});
