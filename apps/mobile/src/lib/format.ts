/**
 * Presentation formatting.
 *
 * All arithmetic and unit conversion is delegated to `@fi/domain` — this file
 * only decides how a value reads (BRD §16.1: convert only in the presentation
 * layer, and never reimplement a formula).
 */
import {
  decOrNull,
  decToString,
  formatWeight as formatWeightKg,
  fromDisplayUnit,
  toDisplayUnit,
  unitLabel,
  type UnitSystem,
} from '@fi/domain';

export { unitLabel };
export type { UnitSystem };

/** A canonical-kilogram wire value, rendered in the user's unit. */
export function formatWeight(weightKg: string | null, units: UnitSystem): string {
  const value = decOrNull(weightKg);
  return value === null ? '—' : formatWeightKg(value, units);
}

/** The bare number in the user's unit, for an input field's initial value. */
export function weightForInput(weightKg: string | null, units: UnitSystem): string {
  const value = decOrNull(weightKg);
  if (value === null) return '';
  const text = decToString(toDisplayUnit(value, units));
  return text.endsWith('.00') ? text.slice(0, -3) : text;
}

/** What the user typed, in their unit, back to the canonical wire value. */
export function weightFromInput(input: string, units: UnitSystem): string | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = decOrNull(trimmed);
  return parsed === null ? null : decToString(fromDisplayUnit(parsed, units));
}

export function formatVolume(volumeKg: string | null, units: UnitSystem): string {
  const value = decOrNull(volumeKg);
  if (value === null) return '—';
  const converted = toDisplayUnit(value, units);
  const whole = Math.round(Number(decToString(converted)));
  return `${whole.toLocaleString()} ${unitLabel(units)}`;
}

/** `1h 07m`, `48m`, `35s` — compact enough for a summary row. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/** `2:30`, for a rest timer counting down. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** "Today", "Yesterday", then a date. Relative labels only where they help. */
export function formatWorkoutDate(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  const days = Math.floor(
    (Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const PR_LABELS: Record<string, string> = {
  heaviest_weight: 'Heaviest weight',
  best_1rm: 'Best estimated 1RM',
  best_set_volume: 'Best set volume',
};

export function formatPrType(prType: string): string {
  return PR_LABELS[prType] ?? prType;
}

const METRIC_LABELS: Record<string, string> = {
  best_set_weight: 'Top set',
  estimated_1rm: 'Est. 1RM',
  total_volume: 'Volume',
  total_reps: 'Reps',
};

export function formatMetric(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

const PREFILL_LABELS: Record<string, string> = {
  previous_set: 'from your last set',
  last_session: 'from last session',
  routine_target: 'from your routine',
  empty: '',
};

/** FR-WK-06: a prefilled number is always explained. */
export function formatPrefillOrigin(origin: string): string {
  return PREFILL_LABELS[origin] ?? '';
}
