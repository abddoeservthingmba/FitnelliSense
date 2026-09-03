/**
 * Compact numbers, for figures that outgrow their column.
 *
 * Lifetime volume passes a million kilograms faster than it sounds — a few
 * hundred sessions at five tonnes each — and "1,284,500 kg" in a stat block
 * either wraps onto two lines or shrinks until it cannot be read. Worse, at
 * that length the digits stop being a quantity and become a barcode: nobody
 * reads the fourth digit of a seven-digit number.
 *
 * So past a threshold the number is abbreviated with ONE decimal place, which
 * is the resolution a glance actually uses. "1.3M" is read correctly and
 * instantly; "1,284,500" is not read at all.
 */

/**
 * Below this, the full number is clearer than an abbreviation.
 *
 * 10,000 rather than 1,000: "9,850 kg" reads fine and is more informative than
 * "9.9k", whereas "12,400" gains nothing over "12.4k" and costs three
 * characters.
 */
export const COMPACT_FROM = 10_000;

/**
 * The unit to abbreviate in.
 *
 * Written as an exhaustive ladder rather than a search through a table,
 * because a search needs a "nothing matched" fallback that can never fire —
 * every caller has already passed the 10,000 threshold, which is ten times the
 * smallest unit. An unreachable branch is one that can never be tested.
 */
function unitFor(magnitude: number): { at: number; suffix: string } {
  if (magnitude >= 1_000_000_000) return { at: 1_000_000_000, suffix: 'B' };
  if (magnitude >= 1_000_000) return { at: 1_000_000, suffix: 'M' };
  return { at: 1_000, suffix: 'k' };
}

/**
 * A number, abbreviated once it is long enough to stop being readable.
 *
 * Truncates rather than rounds up. A total is a claim about what someone has
 * actually done, and rounding 999,600 up to "1M" overstates it — the figure
 * should never be able to reach a milestone the work has not.
 *
 * A trailing `.0` is dropped, so it is "2M" and not "2.0M".
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const negative = value < 0;
  const magnitude = Math.abs(value);

  if (magnitude < COMPACT_FROM) {
    // Grouped, because four digits are easier to read as 9,850 than 9850.
    return (negative ? -magnitude : magnitude).toLocaleString('en-GB', {
      maximumFractionDigits: 0,
    });
  }

  const unit = unitFor(magnitude);

  // Truncate to one decimal: Math.floor on the scaled value, not toFixed,
  // which rounds.
  const scaled = Math.floor((magnitude / unit.at) * 10) / 10;
  const text = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
  return `${negative ? '-' : ''}${text}${unit.suffix}`;
}

/**
 * The same, for a decimal string off the wire.
 *
 * Weights arrive as decimal strings and must not be parsed into a float
 * anywhere they are still being used as a value — but this is the last step
 * before the screen, where the number becomes text and precision beyond one
 * decimal is being discarded on purpose.
 */
export function formatCompactDecimal(value: string): string {
  return formatCompact(Number(value));
}
