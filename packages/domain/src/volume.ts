/**
 * Volume calculations. BRD NFR-M-04 — these are the numbers history, progress
 * charts and (from Phase 4) AI context all read, so there is exactly one
 * implementation and it lives here.
 */
import { type Dec, ZERO, add, mulInt, sum } from './decimal.js';
import { type Counting, type LoggedSet, type SetType } from './types.js';

/** Warmup sets are logged but excluded from volume, as lifters expect. */
export const VOLUME_COUNTED_SET_TYPES: readonly SetType[] = ['normal', 'failure', 'drop'];

/**
 * Whether a set contributes to volume, and — via the type predicate — proof
 * for the compiler that its weight and reps are present.
 */
export function countsTowardVolume<T extends LoggedSet>(set: T): set is Counting<T> {
  return (
    set.isCompleted &&
    VOLUME_COUNTED_SET_TYPES.includes(set.setType) &&
    set.weightKg !== null &&
    set.reps !== null &&
    set.reps > 0
  );
}

/** weight × reps for a single set; zero when the set does not count. */
export function setVolume(set: LoggedSet): Dec {
  return countsTowardVolume(set) ? mulInt(set.weightKg, set.reps) : ZERO;
}

export function totalVolume(sets: readonly LoggedSet[]): Dec {
  return sum(sets.map(setVolume));
}

export function totalReps(sets: readonly LoggedSet[]): number {
  let reps = 0;
  for (const set of sets) if (countsTowardVolume(set)) reps += set.reps;
  return reps;
}

export function completedSetCount(sets: readonly LoggedSet[]): number {
  return sets.filter((set) => set.isCompleted).length;
}

/** The heaviest completed working set, or null when nothing qualifies. */
export function heaviestSet<T extends LoggedSet>(sets: readonly T[]): Counting<T> | null {
  let best: Counting<T> | null = null;
  for (const set of sets) {
    if (!countsTowardVolume(set)) continue;
    if (best === null || set.weightKg > best.weightKg) best = set;
  }
  return best;
}

/** Volume grouped by exercise, for imbalance heuristics and summaries. */
export function volumeByExercise(
  sets: readonly (LoggedSet & { exerciseId: string })[],
): Map<string, Dec> {
  const totals = new Map<string, Dec>();
  for (const set of sets) {
    const current = totals.get(set.exerciseId) ?? ZERO;
    totals.set(set.exerciseId, add(current, setVolume(set)));
  }
  return totals;
}
