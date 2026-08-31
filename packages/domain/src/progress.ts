/**
 * Progress aggregation. BRD FR-HP-04 (per-exercise series) and FR-HP-07
 * (dashboard streak and rolling volume). Deterministic and pure — from Phase 4
 * these are the figures handed to the model as context (BRD §8.4).
 */
import { type Dec, ZERO, add, max } from './decimal';
import { estimate1RM } from './one-rep-max';
import { type Counting, type LoggedSet } from './types';
import { countsTowardVolume, setVolume } from './volume';

export type ProgressMetric = 'best_set_weight' | 'estimated_1rm' | 'total_volume' | 'total_reps';

export const PROGRESS_METRICS: readonly ProgressMetric[] = [
  'best_set_weight',
  'estimated_1rm',
  'total_volume',
  'total_reps',
];

export interface SessionSets {
  /** Session date as an ISO date (`YYYY-MM-DD`), already in the user's zone. */
  readonly date: string;
  readonly sets: readonly LoggedSet[];
}

export interface ProgressPoint {
  readonly date: string;
  /** Two-decimal exact value; reps metrics are whole numbers held the same way. */
  readonly value: Dec;
}

/** The per-set contribution to a metric, or null when the set cannot contribute. */
function setContribution(set: Counting<LoggedSet>, metric: ProgressMetric): Dec | null {
  switch (metric) {
    case 'best_set_weight':
      return set.weightKg;
    case 'estimated_1rm':
      return estimate1RM(set.weightKg, set.reps);
    case 'total_volume':
      return setVolume(set);
    case 'total_reps':
      return (set.reps * 100) as Dec;
  }
}

const IS_PEAK_METRIC: Record<ProgressMetric, boolean> = {
  best_set_weight: true,
  estimated_1rm: true,
  total_volume: false,
  total_reps: false,
};

function metricValue(sets: readonly LoggedSet[], metric: ProgressMetric): Dec | null {
  const peak = IS_PEAK_METRIC[metric];
  let accumulated = ZERO;
  let any = false;

  for (const set of sets) {
    if (!countsTowardVolume(set)) continue;
    const contribution = setContribution(set, metric);
    if (contribution === null) continue;
    accumulated = peak ? max(accumulated, contribution) : add(accumulated, contribution);
    any = true;
  }

  return any && accumulated > 0 ? accumulated : null;
}

/** One point per session that has qualifying sets, oldest first. */
export function progressSeries(
  sessions: readonly SessionSets[],
  metric: ProgressMetric,
): ProgressPoint[] {
  return sessions
    .map((session) => ({ date: session.date, value: metricValue(session.sets, metric) }))
    .filter((point): point is ProgressPoint => point.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

const DAY_MS = 86_400_000;

function toUtcDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/**
 * Consecutive-day streak ending today or yesterday. Yesterday still counts:
 * a streak should not be declared broken before the day is over.
 */
export function currentStreakDays(workoutDates: readonly string[], today: string): number {
  const days = [...new Set(workoutDates.map(toUtcDay))].sort((a, b) => b - a);
  const todayDay = toUtcDay(today);
  const firstDay = days[0];
  if (firstDay === undefined) return 0;
  if (firstDay < todayDay - 1) return 0;

  let streak = 1;
  let cursor = firstDay;
  for (const day of days.slice(1)) {
    if (day === cursor - 1) {
      streak += 1;
      cursor = day;
    } else if (day < cursor - 1) {
      break;
    }
  }
  return streak;
}

/** Inclusive of `since`, so a 7-day window covers today and the six before it. */
export function volumeSince(
  sessions: readonly { date: string; volumeKg: Dec }[],
  since: string,
): Dec {
  const sinceDay = toUtcDay(since);
  let total = ZERO;
  for (const session of sessions) {
    if (toUtcDay(session.date) >= sinceDay) total = add(total, session.volumeKg);
  }
  return total;
}

export function isoDateDaysAgo(today: string, days: number): string {
  const date = new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS);
  return date.toISOString().slice(0, 10);
}
