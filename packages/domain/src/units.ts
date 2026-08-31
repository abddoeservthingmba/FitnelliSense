/**
 * Unit conversion. BRD FR-WK-12: kilograms are canonical everywhere; pounds
 * exist only at the presentation layer.
 */
import { type Dec, dec, decToString, mulFloat } from './decimal.js';

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

export type UnitSystem = 'metric' | 'imperial';

export function kgToLb(kg: Dec): Dec {
  return mulFloat(kg, LB_PER_KG);
}

export function lbToKg(lb: Dec): Dec {
  return mulFloat(lb, KG_PER_LB);
}

/** Converts a canonical kilogram value into the unit the user has chosen. */
export function toDisplayUnit(kg: Dec, units: UnitSystem): Dec {
  return units === 'imperial' ? kgToLb(kg) : kg;
}

/** Converts a value the user typed, in their chosen unit, back to kilograms. */
export function fromDisplayUnit(value: Dec, units: UnitSystem): Dec {
  return units === 'imperial' ? lbToKg(value) : value;
}

export function unitLabel(units: UnitSystem): 'kg' | 'lb' {
  return units === 'imperial' ? 'lb' : 'kg';
}

/**
 * Formats for display: drops a trailing `.00` so the common case reads as
 * `80 kg` rather than `80.00 kg`, and keeps one place otherwise.
 */
export function formatWeight(kg: Dec, units: UnitSystem): string {
  const value = toDisplayUnit(kg, units);
  const text = decToString(value);
  const trimmed = text.endsWith('.00') ? text.slice(0, -3) : text.replace(/0$/, '');
  return `${trimmed} ${unitLabel(units)}`;
}

/**
 * Snaps a weight to the smallest plate increment that is realistic for the
 * user's unit — 2.5 kg / 5 lb bar jumps are the default gym reality, but the
 * increment is a parameter so nothing is hard-coded into a screen.
 */
export function roundToIncrement(kg: Dec, incrementKg: Dec): Dec {
  if (incrementKg <= 0) throw new RangeError('Increment must be positive');
  const steps = Math.round(kg / incrementKg);
  return (steps * incrementKg) as Dec;
}

export const DEFAULT_INCREMENT_KG = dec('2.5');
