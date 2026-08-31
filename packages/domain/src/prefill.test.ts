import { describe, expect, it } from 'vitest';
import { dec, decToString } from './decimal';
import { prefillSet } from './prefill';

describe('prefillSet', () => {
  it('prefers the previous set in the live workout', () => {
    const result = prefillSet({
      previousSet: { weightKg: dec('82.5'), reps: 8 },
      lastSession: { weightKg: dec('80'), reps: 10 },
      routineTarget: { targetWeightKg: dec('75'), targetRepsMin: 5, targetRepsMax: 8 },
    });
    expect(decToString(result.weightKg ?? dec('0'))).toBe('82.50');
    expect(result.origin).toBe('previous_set');
  });

  it('falls back to the last session for that exercise', () => {
    const result = prefillSet({
      previousSet: null,
      lastSession: { weightKg: dec('80'), reps: 10 },
    });
    expect(result.origin).toBe('last_session');
    expect(result.reps).toBe(10);
  });

  it('falls back to the routine target, using the bottom of the rep range', () => {
    const result = prefillSet({
      routineTarget: { targetWeightKg: dec('75'), targetRepsMin: 5, targetRepsMax: 8 },
    });
    expect(result.origin).toBe('routine_target');
    expect(result.reps).toBe(5);
  });

  it('uses the top of the range when no minimum is set', () => {
    const result = prefillSet({
      routineTarget: { targetWeightKg: null, targetRepsMin: null, targetRepsMax: 12 },
    });
    expect(result.reps).toBe(12);
    expect(result.weightKg).toBeNull();
  });

  it('returns empty when nothing is known', () => {
    expect(prefillSet({}).origin).toBe('empty');
    expect(prefillSet({ previousSet: { weightKg: null, reps: null } }).origin).toBe('empty');
    expect(
      prefillSet({
        routineTarget: { targetWeightKg: null, targetRepsMin: null, targetRepsMax: null },
      }).origin,
    ).toBe('empty');
  });

  it('accepts a partially filled source', () => {
    expect(prefillSet({ previousSet: { weightKg: dec('60'), reps: null } }).origin).toBe(
      'previous_set',
    );
  });
});
