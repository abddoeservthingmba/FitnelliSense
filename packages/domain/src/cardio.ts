/**
 * Cardio arithmetic — FR-CAR-01..08 (BRD v0.2 scope extension).
 *
 * A treadmill set has no weight and no reps, so none of the strength maths
 * applies to it: 1RM is meaningless, and `weight × reps` volume is zero. Adding
 * cardio to the same `workout_sets` table without this module would silently
 * report every run as zero work done.
 *
 * What a cardio set has instead is **time and distance**. Both are optional
 * independently, because both are things people actually log alone: "20 minutes
 * on the bike" with no distance, or "5 km" with no stopwatch.
 *
 * Distances are held in whole metres and durations in whole seconds. Neither
 * needs `Dec`: a metre is already fine-grained enough for a run, and nobody
 * logs a fraction of a second on a treadmill. Pace is the only derived value
 * with a fraction, and it is presentation-only.
 */

import { dec, decToNumber, type Dec } from './decimal';
import type { CardioPrType } from './types';

/** One logged cardio effort. Either field may be absent. */
export interface CardioSet {
  readonly durationSecs?: number | null;
  readonly distanceM?: number | null;
}

export interface CardioTotals {
  readonly durationSecs: number;
  readonly distanceM: number;
  /** How many sets contributed anything at all. */
  readonly sets: number;
}

export const EMPTY_CARDIO: CardioTotals = { durationSecs: 0, distanceM: 0, sets: 0 };

/** Whether a set carries any cardio work at all. */
export function isCardioLogged(set: CardioSet): boolean {
  return (set.durationSecs ?? 0) > 0 || (set.distanceM ?? 0) > 0;
}

/**
 * Adds up a session's cardio.
 *
 * Sets with neither figure are skipped rather than counted as an empty effort —
 * a row the user created and never filled in should not make the session look
 * like it contained a zero-distance run.
 */
export function cardioTotals(sets: readonly CardioSet[]): CardioTotals {
  let durationSecs = 0;
  let distanceM = 0;
  let counted = 0;

  for (const set of sets) {
    if (!isCardioLogged(set)) continue;
    durationSecs += set.durationSecs ?? 0;
    distanceM += set.distanceM ?? 0;
    counted += 1;
  }

  return { durationSecs, distanceM, sets: counted };
}

/**
 * Pace in seconds per kilometre, or null.
 *
 * Null when either figure is missing, because a pace invented from one of them
 * would be a fabricated number — and this is the figure runners judge
 * themselves by, so a wrong one is worse than none.
 */
export function paceSecsPerKm(set: CardioSet): number | null {
  const seconds = set.durationSecs ?? 0;
  const metres = set.distanceM ?? 0;
  if (seconds <= 0 || metres <= 0) return null;
  return Math.round((seconds / metres) * 1000);
}

/** Speed in km/h, for the cycling and rowing cases where pace reads oddly. */
export function speedKmh(set: CardioSet): number | null {
  const seconds = set.durationSecs ?? 0;
  const metres = set.distanceM ?? 0;
  if (seconds <= 0 || metres <= 0) return null;
  return Math.round((metres / seconds) * 3.6 * 10) / 10;
}

/** `mm:ss`, the way a pace is always written. */
export function formatPace(secsPerKm: number | null): string {
  if (secsPerKm === null || secsPerKm <= 0) return '—';
  const minutes = Math.floor(secsPerKm / 60);
  const seconds = secsPerKm % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * A duration as a person would say it: `45m`, `1h 05m`, `30s`.
 *
 * Seconds are shown only under a minute. Nobody describes a 47-minute run as
 * "47m 12s", and the extra precision makes the number harder to read at a
 * glance rather than more useful.
 */
export function formatDuration(totalSecs: number): string {
  if (totalSecs <= 0) return '—';
  if (totalSecs < 60) return `${totalSecs}s`;

  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/** Metres as km above a kilometre, metres below it. */
export function formatDistance(metres: number): string {
  if (metres <= 0) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

// --------------------------------------------------------------------- XP --

/**
 * XP for cardio work.
 *
 * Paid per minute and per kilometre, and deliberately **not** per calorie:
 * calories would have to be estimated from bodyweight and effort, and the
 * Hunter System's rule is that it decorates real data rather than inventing it
 * (FR-HS-10). Minutes and metres are things the user actually recorded.
 *
 * Calibrated against a workout's ~50 XP session bonus: a half-hour run earns
 * roughly what a short lifting session does, which is the honest comparison.
 */
const XP_PER_CARDIO_MINUTE = 2;
const XP_PER_CARDIO_KM = 10;

export function cardioXp(totals: CardioTotals): number {
  if (totals.sets === 0) return 0;
  const minutes = Math.floor(totals.durationSecs / 60);
  const kilometres = totals.distanceM / 1000;
  return Math.round(minutes * XP_PER_CARDIO_MINUTE + kilometres * XP_PER_CARDIO_KM);
}

// -------------------------------------------------------------- records --

/**
 * Cardio personal records.
 *
 * Three, matching the three questions people actually ask of a run: how far,
 * how long, and how fast. Pace is the one that needs care — *lower* is better,
 * which inverts the comparison every other record in this codebase uses.
 */
export interface CardioRecordCandidate {
  readonly distanceM: number | null;
  readonly durationSecs: number | null;
  readonly paceSecsPerKm: number | null;
}

export function cardioRecordOf(set: CardioSet): CardioRecordCandidate {
  // `?? null` normalises absent to null. The candidate type uses `| null`
  // rather than `?` deliberately: a record comparison should not have to
  // distinguish "not provided" from "explicitly nothing", and collapsing the
  // two here means it never does.
  return {
    distanceM: set.distanceM ?? null,
    durationSecs: set.durationSecs ?? null,
    paceSecsPerKm: paceSecsPerKm(set),
  };
}

/**
 * Whether a candidate beats the current best.
 *
 * `null` for the existing best means "no record yet", which anything beats.
 *
 * A minimum distance applies to pace: sprinting 50 metres produces a pace no
 * one can hold for a kilometre, and letting it take the record would make the
 * figure useless and permanently unbeatable.
 */
export const MIN_PACE_RECORD_DISTANCE_M = 1000;

export function beatsCardioRecord(
  type: 'farthest_distance' | 'longest_duration' | 'best_pace',
  candidate: CardioRecordCandidate,
  currentBest: number | null,
): boolean {
  if (type === 'farthest_distance') {
    const value = candidate.distanceM ?? 0;
    return value > 0 && (currentBest === null || value > currentBest);
  }

  if (type === 'longest_duration') {
    const value = candidate.durationSecs ?? 0;
    return value > 0 && (currentBest === null || value > currentBest);
  }

  // Pace: lower is better, and only over a distance worth comparing.
  //
  // The distance is checked first. Ordered the other way, the `?? 0` on the
  // distance would be unreachable — a non-null pace already implies a distance —
  // and an unreachable branch cannot be tested. This order also reads as the
  // rule actually is: a sprint is not eligible, whatever its pace.
  if ((candidate.distanceM ?? 0) < MIN_PACE_RECORD_DISTANCE_M) return false;

  const value = candidate.paceSecsPerKm;
  if (value === null || value <= 0) return false;
  return currentBest === null || value < currentBest;
}

/**
 * Cardio records from a session's sets.
 *
 * Deliberately separate from `detectPRs` rather than folded into it. That
 * function narrows every set through `countsTowardVolume`, which requires a
 * weight and a rep count — a treadmill set has neither and would be discarded
 * before it was ever considered. Sharing the loop would mean loosening a
 * narrowing that exists to keep the strength maths free of null checks.
 *
 * The two produce the same `PrCandidate` shape and land in the same table, so
 * the caller simply concatenates them.
 */
export function detectCardioPRs(
  sets: readonly CardioAttributedSet[],
  existing: ReadonlyMap<string, Dec> = new Map(),
): CardioPrCandidate[] {
  const best = new Map<string, CardioPrCandidate>();

  for (const set of sets) {
    if (!set.isCompleted || !isCardioLogged(set)) continue;

    const candidate = cardioRecordOf(set);

    for (const prType of CARDIO_PR_TYPES) {
      const value = cardioValueFor(candidate, prType);
      if (value === null) continue;

      const key = `${set.exerciseId}:${prType}`;
      const stored = existing.get(key);
      const storedValue = stored === undefined ? null : decToNumber(stored);

      if (!beatsCardioRecord(prType, candidate, storedValue)) continue;

      // Within one session, keep only the best set for each record.
      const alreadyBest = best.get(key);
      if (alreadyBest && !beatsCardioRecord(prType, candidate, alreadyBest.rawValue)) continue;

      best.set(key, {
        exerciseId: set.exerciseId,
        prType,
        value: dec(value),
        rawValue: value,
        setId: set.id,
        weightKg: null,
        reps: null,
        previousValue: stored ?? null,
      });
    }
  }

  return [...best.values()];
}

export const CARDIO_PR_TYPES = [
  'farthest_distance',
  'longest_duration',
  'best_pace',
] as const satisfies readonly CardioPrType[];

/** The stored value for a record type: metres, seconds, or seconds per km. */
function cardioValueFor(candidate: CardioRecordCandidate, prType: CardioPrType): number | null {
  switch (prType) {
    case 'farthest_distance':
      return candidate.distanceM;
    case 'longest_duration':
      return candidate.durationSecs;
    case 'best_pace':
      return candidate.paceSecsPerKm;
  }
}

export interface CardioAttributedSet extends CardioSet {
  readonly id: string;
  readonly exerciseId: string;
  readonly isCompleted: boolean;
}

export interface CardioPrCandidate {
  readonly exerciseId: string;
  readonly prType: CardioPrType;
  readonly value: Dec;
  /** The same value as a plain number, for comparing within the session. */
  readonly rawValue: number;
  readonly setId: string;
  readonly weightKg: Dec | null;
  readonly reps: number | null;
  readonly previousValue: Dec | null;
}
