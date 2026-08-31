/**
 * Fixed-point decimal arithmetic at two decimal places.
 *
 * BRD §9.3: weights are persisted as Postgres NUMERIC and transmitted as
 * numeric strings. Nothing in this codebase may do float arithmetic on a
 * weight, so every domain calculation runs through this module, which stores
 * values as an integer number of hundredths.
 *
 * Range: NUMERIC(10,2) tops out at 99,999,999.99 -> 9,999,999,999 hundredths,
 * comfortably inside Number.MAX_SAFE_INTEGER.
 */

declare const decBrand: unique symbol;

/** An exact decimal with two fractional digits, held as integer hundredths. */
export type Dec = number & { readonly [decBrand]: 'Dec' };

const SCALE = 100;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export const ZERO = 0 as Dec;

/** Rounds half away from zero, matching Postgres NUMERIC rounding. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function assertFinite(hundredths: number): Dec {
  if (!Number.isFinite(hundredths) || !Number.isSafeInteger(hundredths)) {
    throw new RangeError(`Decimal overflow: ${hundredths}`);
  }
  return hundredths as Dec;
}

/**
 * Parses a decimal string (the wire format) or a whole/finite number.
 * Values with more than two decimal places are rounded, not rejected, so a
 * client sending `72.505` gets `72.51` rather than a validation failure.
 */
export function dec(value: string | number): Dec {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Not a finite number: ${value}`);
    return assertFinite(roundHalfUp(value * SCALE));
  }
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) throw new TypeError(`Not a decimal string: ${value}`);
  const negative = trimmed.startsWith('-');
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.');
  const padded = `${fraction}000`.slice(0, 3);
  const hundredths = Number(whole) * SCALE + Number(padded.slice(0, 2));
  const rounded = Number(padded[2]) >= 5 ? hundredths + 1 : hundredths;
  return assertFinite(negative ? -rounded : rounded);
}

/** Parses a value that may be absent, returning null rather than throwing. */
export function decOrNull(value: string | number | null | undefined): Dec | null {
  if (value === null || value === undefined || value === '') return null;
  return dec(value);
}

/** Renders as a fixed two-decimal string — the canonical wire format. */
export function decToString(value: Dec): string {
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude / SCALE);
  const fraction = String(magnitude % SCALE).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Lossy — only for charts and other presentation-layer consumers. */
export function decToNumber(value: Dec): number {
  return value / SCALE;
}

export function add(a: Dec, b: Dec): Dec {
  return assertFinite(a + b);
}

export function sub(a: Dec, b: Dec): Dec {
  return assertFinite(a - b);
}

/** Multiplies by an exact integer (reps, set counts). */
export function mulInt(a: Dec, factor: number): Dec {
  if (!Number.isSafeInteger(factor)) throw new TypeError(`Factor must be an integer: ${factor}`);
  return assertFinite(a * factor);
}

/** Multiplies by a real factor, rounding the result back to two places. */
export function mulFloat(a: Dec, factor: number): Dec {
  if (!Number.isFinite(factor)) throw new TypeError(`Factor must be finite: ${factor}`);
  return assertFinite(roundHalfUp(a * factor));
}

export function sum(values: readonly Dec[]): Dec {
  let total = ZERO;
  for (const value of values) total = add(total, value);
  return total;
}

export function gt(a: Dec, b: Dec): boolean {
  return a > b;
}

export function max(a: Dec, b: Dec): Dec {
  return a >= b ? a : b;
}
