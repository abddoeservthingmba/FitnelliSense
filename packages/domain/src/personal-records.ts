/**
 * Personal record detection. BRD FR-HP-06 — run once on workout completion,
 * pure and deterministic so the same workout always yields the same records.
 */
import { type Dec, gt } from './decimal';
import { estimate1RM } from './one-rep-max';
import { type AttributedSet, type Counting, type PrType } from './types';
import { countsTowardVolume, setVolume } from './volume';

export const PR_TYPES: readonly PrType[] = ['heaviest_weight', 'best_1rm', 'best_set_volume'];

/** The user's current best per exercise and type, as `${exerciseId}:${prType}`. */
export type ExistingRecords = ReadonlyMap<string, Dec>;

export interface PrCandidate {
  readonly exerciseId: string;
  readonly prType: PrType;
  readonly value: Dec;
  readonly setId: string;
  readonly weightKg: Dec | null;
  readonly reps: number | null;
  readonly previousValue: Dec | null;
}

export function recordKey(exerciseId: string, prType: PrType): string {
  return `${exerciseId}:${prType}`;
}

/** The candidate value for one set and one record type, or null if inapplicable. */
function valueFor(set: Counting<AttributedSet>, prType: PrType): Dec | null {
  switch (prType) {
    case 'heaviest_weight':
      return set.weightKg;
    case 'best_1rm':
      return estimate1RM(set.weightKg, set.reps);
    case 'best_set_volume':
      return setVolume(set);
  }
}

/**
 * Returns at most one record per (exercise, type): the best set of the
 * workout, and only when it beats the stored best. Ties are not records —
 * repeating yesterday's top set should not fire a celebration.
 */
export function detectPRs(
  sets: readonly AttributedSet[],
  existing: ExistingRecords = new Map(),
): PrCandidate[] {
  const best = new Map<string, PrCandidate>();

  for (const set of sets) {
    if (!countsTowardVolume(set)) continue;

    for (const prType of PR_TYPES) {
      const value = valueFor(set, prType);
      if (value === null || value <= 0) continue;

      const key = recordKey(set.exerciseId, prType);
      const previousValue = existing.get(key) ?? null;
      if (previousValue !== null && !gt(value, previousValue)) continue;

      const incumbent = best.get(key);
      if (incumbent && !gt(value, incumbent.value)) continue;

      best.set(key, {
        exerciseId: set.exerciseId,
        prType,
        value,
        setId: set.id,
        weightKg: set.weightKg,
        reps: set.reps,
        previousValue,
      });
    }
  }

  return [...best.values()];
}
