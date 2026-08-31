import { describe, expect, it } from 'vitest';
import {
  ZERO,
  add,
  dec,
  decOrNull,
  decToNumber,
  decToString,
  gt,
  max,
  mulFloat,
  mulInt,
  sub,
  sum,
} from './decimal.js';

describe('dec', () => {
  it('parses whole and fractional strings', () => {
    expect(decToString(dec('80'))).toBe('80.00');
    expect(decToString(dec('80.5'))).toBe('80.50');
    expect(decToString(dec('80.05'))).toBe('80.05');
    expect(decToString(dec('0'))).toBe('0.00');
  });

  it('rounds a third decimal place half away from zero', () => {
    expect(decToString(dec('72.505'))).toBe('72.51');
    expect(decToString(dec('72.504'))).toBe('72.50');
    expect(decToString(dec('1.999'))).toBe('2.00');
  });

  it('handles negative values', () => {
    expect(decToString(dec('-2.5'))).toBe('-2.50');
    expect(decToString(dec('-2.505'))).toBe('-2.51');
    expect(decToString(dec(-2.5))).toBe('-2.50');
  });

  it('accepts finite numbers, rounding to two places', () => {
    expect(decToString(dec(80))).toBe('80.00');
    expect(decToString(dec(80.456))).toBe('80.46');
  });

  it('tolerates surrounding whitespace', () => {
    expect(decToString(dec('  12.25  '))).toBe('12.25');
  });

  it('rejects values that are not decimals', () => {
    expect(() => dec('abc')).toThrow(TypeError);
    expect(() => dec('')).toThrow(TypeError);
    expect(() => dec('1.2.3')).toThrow(TypeError);
    expect(() => dec(Number.NaN)).toThrow(TypeError);
    expect(() => dec(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('refuses values beyond exact integer range', () => {
    expect(() => dec(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});

describe('decOrNull', () => {
  it('passes absent values through as null', () => {
    expect(decOrNull(null)).toBeNull();
    expect(decOrNull(undefined)).toBeNull();
    expect(decOrNull('')).toBeNull();
  });

  it('parses present values', () => {
    expect(decToString(decOrNull('20') as ReturnType<typeof dec>)).toBe('20.00');
    expect(decToString(decOrNull(20) as ReturnType<typeof dec>)).toBe('20.00');
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and sums exactly', () => {
    expect(decToString(add(dec('0.1'), dec('0.2')))).toBe('0.30');
    expect(decToString(sub(dec('80'), dec('2.5')))).toBe('77.50');
    expect(decToString(sum([dec('10.1'), dec('20.2'), dec('30.3')]))).toBe('60.60');
    expect(decToString(sum([]))).toBe('0.00');
  });

  it('multiplies by integers and by real factors', () => {
    expect(decToString(mulInt(dec('82.5'), 8))).toBe('660.00');
    expect(decToString(mulFloat(dec('100'), 1 + 5 / 30))).toBe('116.67');
  });

  it('rejects non-integer and non-finite factors', () => {
    expect(() => mulInt(dec('80'), 1.5)).toThrow(TypeError);
    expect(() => mulFloat(dec('80'), Number.NaN)).toThrow(TypeError);
  });

  it('compares values', () => {
    expect(gt(dec('81'), dec('80'))).toBe(true);
    expect(gt(dec('80'), dec('80'))).toBe(false);
    expect(decToString(max(dec('80'), dec('90')))).toBe('90.00');
    expect(decToString(max(dec('90'), dec('80')))).toBe('90.00');
    expect(decToString(max(dec('80'), dec('80')))).toBe('80.00');
  });
});

describe('conversion out', () => {
  it('exposes a lossy number for charts only', () => {
    expect(decToNumber(dec('80.25'))).toBe(80.25);
    expect(decToNumber(ZERO)).toBe(0);
  });
});
