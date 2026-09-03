import { describe, expect, it } from 'vitest';
import { dec, decToString } from './decimal';
import {
  compareSessions,
  summariseComparison,
  type ExerciseTopSet,
  type SessionTotals,
} from './session-comparison';

const totals = (
  volume: number,
  sets: number,
  reps: number,
  durationSecs = 3600,
): SessionTotals => ({
  volumeKg: dec(volume),
  sets,
  reps,
  durationSecs,
});

const topSet = (id: string, name: string, weight: number, reps: number): ExerciseTopSet => ({
  exerciseId: id,
  exerciseName: name,
  weightKg: dec(weight),
  reps,
});

describe('compareSessions', () => {
  it('reports the change in volume both ways', () => {
    const result = compareSessions(totals(5000, 20, 100), totals(4000, 18, 90));
    expect(decToString(result.deltaVolumeKg)).toBe('1000.00');
    expect(result.volumeChangePercent).toBe(25);
  });

  it('carries both sides of every total', () => {
    const result = compareSessions(totals(5000, 20, 100, 3600), totals(4000, 18, 90, 3000));
    expect(result.sets).toBe(20);
    expect(result.previousSets).toBe(18);
    expect(result.reps).toBe(100);
    expect(result.previousReps).toBe(90);
    expect(result.durationSecs).toBe(3600);
    expect(result.previousDurationSecs).toBe(3000);
  });

  it('describes a first session without pretending it fell from zero', () => {
    const result = compareSessions(totals(5000, 20, 100), null);
    expect(result.hasPrevious).toBe(false);
    expect(result.volumeChangePercent).toBeNull();
    expect(decToString(result.volumeKg)).toBe('5000.00');
  });

  it('withholds a percentage when the previous session had no volume', () => {
    // A session of nothing but bodyweight work. Dividing by it gives Infinity.
    const result = compareSessions(totals(5000, 20, 100), totals(0, 10, 50));
    expect(result.volumeChangePercent).toBeNull();
    expect(decToString(result.deltaVolumeKg)).toBe('5000.00');
  });

  it('rounds the percentage to one decimal place', () => {
    expect(compareSessions(totals(1234, 1, 1), totals(1000, 1, 1)).volumeChangePercent).toBe(23.4);
  });

  it('matches exercises across the two sessions', () => {
    const result = compareSessions(
      totals(5000, 20, 100),
      totals(4000, 18, 90),
      [topSet('a', 'Bench Press', 100, 5)],
      [topSet('a', 'Bench Press', 95, 5)],
    );
    const bench = result.exercises[0];
    expect(decToString(bench?.deltaWeightKg ?? dec(0))).toBe('5.00');
    expect(decToString(bench?.previousWeightKg ?? dec(0))).toBe('95.00');
    expect(bench?.previousReps).toBe(5);
  });

  it('leaves a new exercise without a comparison rather than inventing one', () => {
    const result = compareSessions(
      totals(5000, 20, 100),
      totals(4000, 18, 90),
      [topSet('new', 'Pendlay Row', 60, 8)],
      [topSet('a', 'Bench Press', 95, 5)],
    );
    expect(result.exercises[0]?.previousWeightKg).toBeNull();
    expect(result.exercises[0]?.deltaWeightKg).toBeNull();
    expect(result.exercises[0]?.moreRepsAtSameWeight).toBe(false);
  });

  it('spots more reps at the same weight', () => {
    // The most common real progress, and the one a heaviest-weight record
    // will never catch.
    const result = compareSessions(
      totals(5000, 20, 100),
      totals(4000, 18, 90),
      [topSet('a', 'Bench Press', 100, 8)],
      [topSet('a', 'Bench Press', 100, 5)],
    );
    expect(result.exercises[0]?.moreRepsAtSameWeight).toBe(true);
  });

  it('does not call fewer reps at the same weight progress', () => {
    const result = compareSessions(
      totals(5000, 20, 100),
      totals(4000, 18, 90),
      [topSet('a', 'Bench Press', 100, 3)],
      [topSet('a', 'Bench Press', 100, 5)],
    );
    expect(result.exercises[0]?.moreRepsAtSameWeight).toBe(false);
  });

  it('does not call more reps at a lighter weight progress on its own', () => {
    const result = compareSessions(
      totals(5000, 20, 100),
      totals(4000, 18, 90),
      [topSet('a', 'Bench Press', 90, 10)],
      [topSet('a', 'Bench Press', 100, 5)],
    );
    expect(result.exercises[0]?.moreRepsAtSameWeight).toBe(false);
    expect(decToString(result.exercises[0]?.deltaWeightKg ?? dec(0))).toBe('-10.00');
  });

  it('compares nothing when no top sets are given', () => {
    expect(compareSessions(totals(5000, 20, 100), totals(4000, 18, 90)).exercises).toEqual([]);
  });
});

describe('summariseComparison', () => {
  const base = (
    current: SessionTotals,
    previous: SessionTotals | null,
    now: ExerciseTopSet[] = [],
    before: ExerciseTopSet[] = [],
  ) => summariseComparison(compareSessions(current, previous, now, before));

  it('frames a first session as a baseline', () => {
    expect(base(totals(5000, 20, 100), null)).toBe(
      'First time through — this is the number to beat.',
    );
  });

  it('names the exercise when exactly one went up', () => {
    expect(
      base(
        totals(5000, 20, 100),
        totals(4900, 20, 100),
        [topSet('a', 'Bench Press', 100, 5)],
        [topSet('a', 'Bench Press', 95, 5)],
      ),
    ).toBe('Bench Press went up 5.00 kg on last time.');
  });

  it('counts them when several went up', () => {
    expect(
      base(
        totals(5000, 20, 100),
        totals(4900, 20, 100),
        [topSet('a', 'Bench', 100, 5), topSet('b', 'Squat', 140, 5)],
        [topSet('a', 'Bench', 95, 5), topSet('b', 'Squat', 135, 5)],
      ),
    ).toBe('2 exercises heavier than last time.');
  });

  it('credits more reps at the same weight', () => {
    expect(
      base(
        totals(5000, 20, 100),
        totals(4900, 20, 100),
        [topSet('a', 'Bench Press', 100, 8)],
        [topSet('a', 'Bench Press', 100, 5)],
      ),
    ).toBe('Same weight on Bench Press, more reps. That still counts.');
  });

  it('falls back to volume when no lift moved', () => {
    expect(base(totals(5000, 20, 100), totals(4000, 20, 100))).toBe(
      '25% more volume than last time.',
    );
  });

  it('says a lighter day plainly rather than spinning it', () => {
    // A deload is usually the plan. Dressing it up as a win would make every
    // other line untrustworthy.
    expect(base(totals(3000, 20, 100), totals(4000, 20, 100))).toBe(
      'A lighter session than last time — 25% less volume.',
    );
  });

  it('mentions extra sets when volume barely moved', () => {
    expect(base(totals(4050, 22, 100), totals(4000, 20, 100))).toBe('2 more sets than last time.');
  });

  it('says so when the session really was the same', () => {
    expect(base(totals(4000, 20, 100), totals(4000, 20, 100))).toBe('About the same as last time.');
  });

  it('says something for a session with no previous volume to divide by', () => {
    expect(base(totals(4000, 20, 100), totals(0, 20, 100))).toBe('About the same as last time.');
  });
});
