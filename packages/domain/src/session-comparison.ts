/**
 * This session against the one before it — FR-WK-10, FR-HP-06.
 *
 * A personal record is rare by definition: most sessions set none, and a
 * summary that can only say "no records today" is silent exactly when someone
 * has just finished training and is most receptive to being told something.
 *
 * The comparison always has something true to say. "Same volume as last week,
 * two sets more" is a real observation about a session that broke nothing.
 *
 * Which session to compare against is the caller's decision, and it matters:
 * the previous run of the SAME routine is the honest comparison. Measuring a
 * leg day against the push day that happened to come before it produces a
 * number that is arithmetically correct and means nothing.
 */
import { ZERO, decToNumber, decToString, sub, type Dec } from './decimal';

export interface SessionTotals {
  readonly volumeKg: Dec;
  readonly sets: number;
  readonly reps: number;
  readonly durationSecs: number;
}

/** The heaviest working set of one exercise in a session. */
export interface ExerciseTopSet {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly weightKg: Dec;
  readonly reps: number;
}

export interface ExerciseComparison {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly weightKg: Dec;
  readonly reps: number;
  /** Null when this exercise was not in the session being compared against. */
  readonly previousWeightKg: Dec | null;
  readonly previousReps: number | null;
  readonly deltaWeightKg: Dec | null;
  /** True when it is the same weight for more reps — progress without a PR. */
  readonly moreRepsAtSameWeight: boolean;
}

export interface SessionComparison {
  readonly volumeKg: Dec;
  readonly previousVolumeKg: Dec;
  readonly deltaVolumeKg: Dec;
  /** Null when there is no previous session, or it had no volume to divide by. */
  readonly volumeChangePercent: number | null;
  readonly sets: number;
  readonly previousSets: number;
  readonly reps: number;
  readonly previousReps: number;
  readonly durationSecs: number;
  readonly previousDurationSecs: number;
  readonly exercises: readonly ExerciseComparison[];
  /** False when this is the first session there is anything to compare with. */
  readonly hasPrevious: boolean;
}

const NO_TOTALS: SessionTotals = {
  volumeKg: ZERO,
  sets: 0,
  reps: 0,
  durationSecs: 0,
};

/**
 * Compares a finished session with the previous one.
 *
 * `previous` being null is the normal first-workout case, not an error: the
 * result still describes the current session in full, with `hasPrevious` false
 * so the caller can phrase it as a starting point rather than a decline from
 * zero.
 */
export function compareSessions(
  current: SessionTotals,
  previous: SessionTotals | null,
  currentTopSets: readonly ExerciseTopSet[] = [],
  previousTopSets: readonly ExerciseTopSet[] = [],
): SessionComparison {
  const before = previous ?? NO_TOTALS;
  const previousVolume = decToNumber(before.volumeKg);

  const previousByExercise = new Map(
    previousTopSets.map((topSet) => [topSet.exerciseId, topSet] as const),
  );

  const exercises = currentTopSets.map((topSet): ExerciseComparison => {
    const last = previousByExercise.get(topSet.exerciseId);
    if (last === undefined) {
      return {
        exerciseId: topSet.exerciseId,
        exerciseName: topSet.exerciseName,
        weightKg: topSet.weightKg,
        reps: topSet.reps,
        previousWeightKg: null,
        previousReps: null,
        deltaWeightKg: null,
        moreRepsAtSameWeight: false,
      };
    }

    const deltaWeightKg = sub(topSet.weightKg, last.weightKg);
    return {
      exerciseId: topSet.exerciseId,
      exerciseName: topSet.exerciseName,
      weightKg: topSet.weightKg,
      reps: topSet.reps,
      previousWeightKg: last.weightKg,
      previousReps: last.reps,
      deltaWeightKg,
      // The most common form of real progress, and the one a
      // heaviest-weight record will never catch.
      moreRepsAtSameWeight: decToNumber(deltaWeightKg) === 0 && topSet.reps > last.reps,
    };
  });

  return {
    volumeKg: current.volumeKg,
    previousVolumeKg: before.volumeKg,
    deltaVolumeKg: sub(current.volumeKg, before.volumeKg),
    volumeChangePercent:
      previous !== null && previousVolume > 0
        ? Math.round(((decToNumber(current.volumeKg) - previousVolume) / previousVolume) * 1000) /
          10
        : null,
    sets: current.sets,
    previousSets: before.sets,
    reps: current.reps,
    previousReps: before.reps,
    durationSecs: current.durationSecs,
    previousDurationSecs: before.durationSecs,
    exercises,
    hasPrevious: previous !== null,
  };
}

/**
 * One line for the summary screen.
 *
 * Returns null when there is genuinely nothing worth saying, so the caller can
 * omit the line rather than print a shrug. Everything here is chosen from
 * numbers already computed — the phrasing is the only thing this adds
 * (FR-AI-09).
 */
export function summariseComparison(comparison: SessionComparison): string | null {
  if (!comparison.hasPrevious) return 'First time through — this is the number to beat.';

  const lifted = comparison.exercises.filter(
    (exercise) => exercise.deltaWeightKg !== null && decToNumber(exercise.deltaWeightKg) > 0,
  );
  if (lifted.length === 1) {
    const only = lifted[0] as ExerciseComparison;
    return `${only.exerciseName} went up ${decToString(only.deltaWeightKg as Dec)} kg on last time.`;
  }
  if (lifted.length > 1) {
    return `${lifted.length} exercises heavier than last time.`;
  }

  const repped = comparison.exercises.filter((exercise) => exercise.moreRepsAtSameWeight);
  if (repped.length > 0) {
    const first = repped[0] as ExerciseComparison;
    return `Same weight on ${first.exerciseName}, more reps. That still counts.`;
  }

  const percent = comparison.volumeChangePercent;
  if (percent !== null && percent >= 5) return `${percent}% more volume than last time.`;
  if (percent !== null && percent <= -5) {
    // Said plainly rather than spun. A lighter day is often the plan.
    return `A lighter session than last time — ${Math.abs(percent)}% less volume.`;
  }

  if (comparison.sets > comparison.previousSets) {
    return `${comparison.sets - comparison.previousSets} more sets than last time.`;
  }

  return 'About the same as last time.';
}
