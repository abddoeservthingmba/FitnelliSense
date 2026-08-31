import { describe, expect, it } from 'vitest';
import { type Dec, dec, decToString } from './decimal';
import { ONE_RM_FORMULA_NAME, ONE_RM_MAX_REPS, estimate1RM } from './one-rep-max';

const str = (value: Dec | null) => (value === null ? null : decToString(value));

describe('estimate1RM', () => {
  it('applies Epley', () => {
    expect(str(estimate1RM(dec('90'), 5))).toBe('105.00');
    expect(str(estimate1RM(dec('100'), 10))).toBe('133.33');
  });

  it('returns the load itself for a single', () => {
    expect(str(estimate1RM(dec('120'), 1))).toBe('120.00');
  });

  it('returns null when an estimate would be meaningless', () => {
    expect(estimate1RM(null, 5)).toBeNull();
    expect(estimate1RM(dec('90'), null)).toBeNull();
    expect(estimate1RM(dec('0'), 5)).toBeNull();
    expect(estimate1RM(dec('90'), 0)).toBeNull();
    expect(estimate1RM(dec('90'), 5.5)).toBeNull();
    expect(estimate1RM(dec('90'), ONE_RM_MAX_REPS + 1)).toBeNull();
  });

  it('names the formula so the UI can attribute it (FR-HP-05)', () => {
    expect(ONE_RM_FORMULA_NAME).toBe('Epley');
  });
});
