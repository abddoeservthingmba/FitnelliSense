import { describe, expect, it } from 'vitest';
import { dec, decToString } from './decimal.js';
import { type LoggedSet, type SetType } from './types.js';
import {
  completedSetCount,
  countsTowardVolume,
  heaviestSet,
  setVolume,
  totalReps,
  totalVolume,
  volumeByExercise,
} from './volume.js';

function set(
  weight: string | null,
  reps: number | null,
  overrides: Partial<LoggedSet> = {},
): LoggedSet {
  return {
    setType: 'normal',
    weightKg: weight === null ? null : dec(weight),
    reps,
    isCompleted: true,
    ...overrides,
  };
}

describe('countsTowardVolume', () => {
  it('counts completed working sets', () => {
    expect(countsTowardVolume(set('80', 8))).toBe(true);
    expect(countsTowardVolume(set('80', 8, { setType: 'failure' }))).toBe(true);
    expect(countsTowardVolume(set('80', 8, { setType: 'drop' }))).toBe(true);
  });

  it('excludes warmups, incomplete sets and empty sets', () => {
    expect(countsTowardVolume(set('80', 8, { setType: 'warmup' as SetType }))).toBe(false);
    expect(countsTowardVolume(set('80', 8, { isCompleted: false }))).toBe(false);
    expect(countsTowardVolume(set(null, 8))).toBe(false);
    expect(countsTowardVolume(set('80', null))).toBe(false);
    expect(countsTowardVolume(set('80', 0))).toBe(false);
  });
});

describe('setVolume', () => {
  it('multiplies weight by reps', () => {
    expect(decToString(setVolume(set('82.5', 8)))).toBe('660.00');
  });

  it('is zero for a set that does not count', () => {
    expect(decToString(setVolume(set('82.5', 8, { setType: 'warmup' })))).toBe('0.00');
    expect(decToString(setVolume(set(null, 8)))).toBe('0.00');
  });
});

describe('aggregates', () => {
  const sets = [
    set('60', 10, { setType: 'warmup' }),
    set('80', 8),
    set('85', 5),
    set('85', 3, { isCompleted: false }),
  ];

  it('totals volume across counting sets only', () => {
    expect(decToString(totalVolume(sets))).toBe('1065.00');
  });

  it('totals reps across counting sets only', () => {
    expect(totalReps(sets)).toBe(13);
  });

  it('counts every completed set, warmups included', () => {
    expect(completedSetCount(sets)).toBe(3);
  });

  it('finds the heaviest working set', () => {
    expect(decToString(heaviestSet(sets)?.weightKg ?? dec('0'))).toBe('85.00');
    expect(heaviestSet([set('60', 10, { setType: 'warmup' })])).toBeNull();
    expect(heaviestSet([])).toBeNull();
  });

  it('keeps the first of two equally heavy sets', () => {
    const first = set('100', 5);
    expect(heaviestSet([first, set('100', 3)])).toBe(first);
  });

  it('groups volume by exercise', () => {
    const grouped = volumeByExercise([
      { ...set('80', 10), exerciseId: 'bench' },
      { ...set('80', 10), exerciseId: 'bench' },
      { ...set('100', 5), exerciseId: 'squat' },
    ]);
    expect(decToString(grouped.get('bench') ?? dec('0'))).toBe('1600.00');
    expect(decToString(grouped.get('squat') ?? dec('0'))).toBe('500.00');
  });
});
