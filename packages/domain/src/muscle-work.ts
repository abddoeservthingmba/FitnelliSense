/**
 * Work done per muscle group, and how it changed — FR-AI-04.
 *
 * The question this answers is "which muscles am I actually training, and is
 * that going up or down". It is the comparison people want from a training log
 * and the one a list of sessions cannot give them.
 *
 * Two attribution decisions shape every number here, and both are judgement
 * calls worth stating rather than burying:
 *
 * **Only primary muscles count.** A bench press works the triceps, but
 * crediting it to them as well would make every pressing day look like arm
 * training. Splitting by some secondary weighting is worse still: nobody
 * agrees on the fractions, so the figures would look precise and be arbitrary.
 *
 * **Volume is split equally between an exercise's primary groups.** A movement
 * with two primaries gives half to each, so the group totals still sum to the
 * session's real volume. Crediting the full amount to both would double-count
 * and quietly inflate every total that included it.
 */
import { ZERO, add, dec, decToNumber, decToString, mulFloat, type Dec } from './decimal';

/** One completed set, with the muscle groups its exercise trains primarily. */
export interface AttributedWork {
  /** Slugs or names — whatever the caller wants to group by. */
  readonly primaryGroups: readonly string[];
  readonly volumeKg: Dec;
  /** The session this set belonged to, so sessions can be counted per group. */
  readonly workoutId: string;
}

export interface MuscleWork {
  readonly group: string;
  readonly volumeKg: Dec;
  readonly sets: number;
  /** Distinct sessions that trained this group at all. */
  readonly workouts: number;
}

/**
 * Totals per muscle group.
 *
 * Groups with no work are absent rather than zero: the caller knows the full
 * taxonomy and can decide whether an untrained group deserves a row. Inventing
 * zero rows here would force that decision on every caller.
 */
export function muscleWork(work: readonly AttributedWork[]): MuscleWork[] {
  const totals = new Map<string, { volume: Dec; sets: number; workouts: Set<string> }>();

  for (const item of work) {
    // A set with no primary group cannot be attributed to anything. Dropping
    // it is right: the alternative is an "unknown" bucket nobody wants to see.
    if (item.primaryGroups.length === 0) continue;

    const share = mulFloat(item.volumeKg, 1 / item.primaryGroups.length);

    for (const group of item.primaryGroups) {
      const existing = totals.get(group) ?? { volume: ZERO, sets: 0, workouts: new Set<string>() };
      existing.volume = add(existing.volume, share);
      existing.sets += 1;
      existing.workouts.add(item.workoutId);
      totals.set(group, existing);
    }
  }

  return [...totals.entries()]
    .map(([group, value]) => ({
      group,
      volumeKg: value.volume,
      sets: value.sets,
      workouts: value.workouts.size,
    }))
    .sort((a, b) => decToNumber(b.volumeKg) - decToNumber(a.volumeKg));
}

// ---------------------------------------------------------- comparison --

/**
 * Below this, a percentage change is not worth quoting.
 *
 * 500 kg is a couple of light sets. Going from that to 5,000 is "+900%", which
 * is arithmetically true and tells the reader nothing except that they started
 * from almost nothing.
 */
export const MIN_VOLUME_FOR_PERCENT_KG = 500;

export interface MuscleChange {
  readonly group: string;
  readonly currentVolumeKg: Dec;
  readonly previousVolumeKg: Dec;
  readonly deltaVolumeKg: Dec;
  /**
   * Null when the previous window holds too little to compare against — from
   * zero, or from a base so small the percentage would be theatre. The absolute
   * change is always present, so the caller can still say something true.
   */
  readonly changePercent: number | null;
  readonly currentSets: number;
  readonly previousSets: number;
  readonly currentWorkouts: number;
  readonly previousWorkouts: number;
}

/**
 * Compares two equal-length windows, group by group.
 *
 * Every group present in either window appears, so a muscle that was trained
 * last month and dropped this month shows as a fall rather than vanishing —
 * which is exactly the case the comparison exists to surface.
 */
export function compareMuscleWork(
  current: readonly MuscleWork[],
  previous: readonly MuscleWork[],
): MuscleChange[] {
  const byGroup = (list: readonly MuscleWork[]) => new Map(list.map((item) => [item.group, item]));
  const now = byGroup(current);
  const before = byGroup(previous);

  const groups = [...new Set([...now.keys(), ...before.keys()])];

  return groups
    .map((group) => {
      const a = now.get(group);
      const b = before.get(group);

      const currentVolumeKg = a?.volumeKg ?? ZERO;
      const previousVolumeKg = b?.volumeKg ?? ZERO;
      const previousNumber = decToNumber(previousVolumeKg);

      const changePercent =
        previousNumber >= MIN_VOLUME_FOR_PERCENT_KG
          ? Math.round(((decToNumber(currentVolumeKg) - previousNumber) / previousNumber) * 1000) /
            10
          : null;

      return {
        group,
        currentVolumeKg,
        previousVolumeKg,
        deltaVolumeKg: dec((decToNumber(currentVolumeKg) - previousNumber).toFixed(2)),
        changePercent,
        currentSets: a?.sets ?? 0,
        previousSets: b?.sets ?? 0,
        currentWorkouts: a?.workouts ?? 0,
        previousWorkouts: b?.workouts ?? 0,
      };
    })
    .sort((x, y) => decToNumber(y.currentVolumeKg) - decToNumber(x.currentVolumeKg));
}

/**
 * The share of total volume each group took, as a percentage.
 *
 * What the bar chart is drawn from. Returned rather than computed in the
 * component, so the chart maps numbers to pixels and never calculates a metric
 * (NFR-M-04).
 */
export function volumeShare(work: readonly MuscleWork[]): { group: string; percent: number }[] {
  const total = work.reduce((sum, item) => sum + decToNumber(item.volumeKg), 0);
  if (total <= 0) return work.map((item) => ({ group: item.group, percent: 0 }));

  return work.map((item) => ({
    group: item.group,
    percent: Math.round((decToNumber(item.volumeKg) / total) * 1000) / 10,
  }));
}

/** The wire form: decimal strings, matching the shared schemas. */
export function muscleWorkToWire(item: MuscleWork): {
  group: string;
  volumeKg: string;
  sets: number;
  workouts: number;
} {
  return {
    group: item.group,
    volumeKg: decToString(item.volumeKg),
    sets: item.sets,
    workouts: item.workouts,
  };
}
