import { describe, expect, it } from 'vitest';
import { type Dec, dec, decToString } from './decimal';
import { detectPRs, recordKey } from './personal-records';
import { type AttributedSet } from './types';

function set(
  id: string,
  weight: string | null,
  reps: number | null,
  overrides: Partial<AttributedSet> = {},
): AttributedSet {
  return {
    id,
    exerciseId: 'bench',
    setType: 'normal',
    weightKg: weight === null ? null : dec(weight),
    reps,
    isCompleted: true,
    ...overrides,
  };
}

const valueOf = (records: ReturnType<typeof detectPRs>, prType: string): string | undefined => {
  const found = records.find((record) => record.prType === prType);
  return found ? decToString(found.value) : undefined;
};

describe('detectPRs', () => {
  it('detects all three record types from a first-ever session', () => {
    const records = detectPRs([set('s1', '90', 5)]);
    expect(records).toHaveLength(3);
    expect(valueOf(records, 'heaviest_weight')).toBe('90.00');
    expect(valueOf(records, 'best_1rm')).toBe('105.00');
    expect(valueOf(records, 'best_set_volume')).toBe('450.00');
    expect(records.every((record) => record.previousValue === null)).toBe(true);
  });

  it('keeps only the best set per record type', () => {
    const records = detectPRs([set('s1', '90', 5), set('s2', '95', 3), set('s3', '80', 10)]);
    expect(valueOf(records, 'heaviest_weight')).toBe('95.00');
    // 80 x 10 gives the largest volume even though it is the lightest load.
    expect(valueOf(records, 'best_set_volume')).toBe('800.00');
    expect(records.find((record) => record.prType === 'heaviest_weight')?.setId).toBe('s2');
  });

  it('only reports values that beat the stored best', () => {
    const existing = new Map<string, Dec>([
      [recordKey('bench', 'heaviest_weight'), dec('95')],
      [recordKey('bench', 'best_1rm'), dec('105')],
      [recordKey('bench', 'best_set_volume'), dec('800')],
    ]);
    expect(detectPRs([set('s1', '90', 5)], existing)).toHaveLength(0);

    const beaten = detectPRs([set('s1', '100', 5)], existing);
    expect(valueOf(beaten, 'heaviest_weight')).toBe('100.00');
    expect(beaten[0]?.previousValue).not.toBeNull();
  });

  it('treats a tie as no record', () => {
    const existing = new Map<string, Dec>([[recordKey('bench', 'heaviest_weight'), dec('90')]]);
    const records = detectPRs([set('s1', '90', 5)], existing);
    expect(valueOf(records, 'heaviest_weight')).toBeUndefined();
  });

  it('ignores sets that do not count toward volume', () => {
    expect(detectPRs([set('s1', '200', 1, { setType: 'warmup' })])).toHaveLength(0);
    expect(detectPRs([set('s1', '200', 1, { isCompleted: false })])).toHaveLength(0);
    expect(detectPRs([set('s1', null, 8)])).toHaveLength(0);
  });

  it('produces no records for a zero-load bodyweight set', () => {
    expect(detectPRs([set('s1', '0', 12)])).toHaveLength(0);
  });

  it('skips the 1RM record when reps are too high to estimate', () => {
    const records = detectPRs([set('s1', '40', 20)]);
    expect(valueOf(records, 'best_1rm')).toBeUndefined();
    expect(valueOf(records, 'heaviest_weight')).toBe('40.00');
  });

  it('separates records per exercise', () => {
    const records = detectPRs([
      set('s1', '90', 5),
      set('s2', '140', 5, { exerciseId: 'squat' }),
    ]);
    expect(records.filter((record) => record.exerciseId === 'bench')).toHaveLength(3);
    expect(records.filter((record) => record.exerciseId === 'squat')).toHaveLength(3);
  });
});
