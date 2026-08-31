import { describe, expect, it } from 'vitest';
import { dec, decToString } from './decimal';
import {
  DEFAULT_INCREMENT_KG,
  formatWeight,
  fromDisplayUnit,
  kgToLb,
  lbToKg,
  roundToIncrement,
  toDisplayUnit,
  unitLabel,
} from './units';

describe('conversion', () => {
  it('round-trips kilograms through pounds', () => {
    expect(decToString(kgToLb(dec('100')))).toBe('220.46');
    expect(decToString(lbToKg(dec('220.46')))).toBe('100.00');
  });

  it('applies the user unit preference in both directions', () => {
    expect(decToString(toDisplayUnit(dec('100'), 'metric'))).toBe('100.00');
    expect(decToString(toDisplayUnit(dec('100'), 'imperial'))).toBe('220.46');
    expect(decToString(fromDisplayUnit(dec('100'), 'metric'))).toBe('100.00');
    expect(decToString(fromDisplayUnit(dec('220.46'), 'imperial'))).toBe('100.00');
  });

  it('labels units', () => {
    expect(unitLabel('metric')).toBe('kg');
    expect(unitLabel('imperial')).toBe('lb');
  });
});

describe('formatWeight', () => {
  it('drops noise from whole and half values', () => {
    expect(formatWeight(dec('80'), 'metric')).toBe('80 kg');
    expect(formatWeight(dec('82.5'), 'metric')).toBe('82.5 kg');
    expect(formatWeight(dec('82.25'), 'metric')).toBe('82.25 kg');
    expect(formatWeight(dec('100'), 'imperial')).toBe('220.46 lb');
  });
});

describe('roundToIncrement', () => {
  it('snaps to the nearest plate step', () => {
    expect(decToString(roundToIncrement(dec('81.3'), DEFAULT_INCREMENT_KG))).toBe('82.50');
    expect(decToString(roundToIncrement(dec('80'), DEFAULT_INCREMENT_KG))).toBe('80.00');
    expect(decToString(roundToIncrement(dec('81.2'), dec('1')))).toBe('81.00');
  });

  it('refuses a non-positive increment', () => {
    expect(() => roundToIncrement(dec('80'), dec('0'))).toThrow(RangeError);
  });
});
