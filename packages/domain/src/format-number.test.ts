import { describe, expect, it } from 'vitest';
import { COMPACT_FROM, formatCompact, formatCompactDecimal } from './format-number';

describe('formatCompact', () => {
  it('leaves small numbers alone, grouped', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(85)).toBe('85');
    expect(formatCompact(9850)).toBe('9,850');
  });

  it('abbreviates from ten thousand', () => {
    expect(COMPACT_FROM).toBe(10_000);
    expect(formatCompact(9999)).toBe('9,999');
    expect(formatCompact(10_000)).toBe('10k');
    expect(formatCompact(12_400)).toBe('12.4k');
    expect(formatCompact(999_900)).toBe('999.9k');
  });

  it('abbreviates millions and billions', () => {
    expect(formatCompact(1_000_000)).toBe('1M');
    expect(formatCompact(1_284_500)).toBe('1.2M');
    expect(formatCompact(12_000_000)).toBe('12M');
    expect(formatCompact(1_500_000_000)).toBe('1.5B');
  });

  it('drops a trailing zero decimal', () => {
    // "2.0M" reads as more precision than is being offered.
    expect(formatCompact(2_000_000)).toBe('2M');
    expect(formatCompact(50_000)).toBe('50k');
  });

  it('truncates rather than rounding up', () => {
    /*
     * The important one. A total is a claim about work actually done, so it
     * must never reach a milestone the work has not: 999,600 kg is not a
     * tonne-thousand, and rounding would say it was.
     */
    expect(formatCompact(999_600)).toBe('999.6k');
    expect(formatCompact(999_999)).toBe('999.9k');
    expect(formatCompact(1_999_999)).toBe('1.9M');
    expect(formatCompact(9_999)).toBe('9,999');
  });

  it('handles negatives, which a delta can be', () => {
    expect(formatCompact(-12_400)).toBe('-12.4k');
    expect(formatCompact(-850)).toBe('-850');
    expect(formatCompact(-2_000_000)).toBe('-2M');
  });

  it('never returns NaN or Infinity on screen', () => {
    expect(formatCompact(Number.NaN)).toBe('0');
    expect(formatCompact(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatCompact(Number.NEGATIVE_INFINITY)).toBe('0');
  });

  it('stays short whatever it is given', () => {
    // The whole reason this exists: the result has to fit a stat block.
    for (const value of [0, 999, 9_999, 10_000, 999_999, 1_000_000, 987_654_321]) {
      expect(formatCompact(value).length, `${value}`).toBeLessThanOrEqual(7);
    }
  });
});

describe('formatCompactDecimal', () => {
  it('takes a decimal string off the wire', () => {
    expect(formatCompactDecimal('1284500.00')).toBe('1.2M');
    expect(formatCompactDecimal('9850.50')).toBe('9,851');
    expect(formatCompactDecimal('0.00')).toBe('0');
  });

  it('does not fall over on a value it cannot read', () => {
    expect(formatCompactDecimal('')).toBe('0');
    expect(formatCompactDecimal('not a number')).toBe('0');
  });
});
