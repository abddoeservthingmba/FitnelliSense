/**
 * Training insights — FR-AI-04, FR-AI-09.
 *
 * This file fetches rows and hands them to `@fi/domain`. It computes nothing:
 * every total, percentage and conclusion below comes from a pure function that
 * is tested to 100% branch coverage, which is the only reason the numbers can
 * be trusted enough to put on a chart.
 *
 * No model is involved anywhere. FR-AI-09 permits one to phrase these figures
 * later; nothing here needs phrasing to be useful.
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import {
  compareMuscleWork,
  countsTowardVolume,
  dec,
  decOrNull,
  decToNumber,
  decToString,
  detectImbalance,
  detectPlateau,
  detectProgression,
  estimate1RM,
  isoDateDaysAgo,
  muscleWork,
  rankInsights,
  setVolume,
  summariseAdherence,
  volumeShare,
  type AttributedWork,
  type ExercisePoint,
  type Insight,
  type MuscleWork,
} from '@fi/domain';
import type { InsightsWindow, TrainingInsights } from '@fi/shared';
import {
  exerciseMuscles,
  exercises,
  muscleGroups,
  muscles,
  userProfiles,
  workoutExercises,
  workoutSets,
  workouts,
} from '../db/schema';
import type { Database } from '../db/client';

const WINDOW_DAYS: Record<InsightsWindow, number> = { '14d': 14, '30d': 30, '90d': 90 };

/**
 * A completed working set, with the muscle groups and exercise it belongs to.
 *
 * One query rather than several: the join is wide but the alternative is
 * fetching sets and then their muscle groups per exercise, which on a free-tier
 * database is many round trips for the same rows.
 */
interface SetRow {
  workoutId: string;
  date: string;
  exerciseId: string;
  exerciseName: string;
  setType: 'normal' | 'warmup' | 'failure' | 'drop';
  weightKg: string | null;
  reps: number | null;
  groupName: string | null;
}

async function fetchSets(
  db: Database,
  userId: string,
  from: string,
  toExclusive: string,
): Promise<SetRow[]> {
  return db
    .select({
      workoutId: workouts.id,
      date: sql<string>`to_char(${workouts.startedAt}, 'YYYY-MM-DD')`,
      exerciseId: workoutExercises.exerciseId,
      exerciseName: exercises.name,
      setType: workoutSets.setType,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      // Primary muscle groups only. A bench press works the triceps, but
      // crediting it to them would make every pressing day look like arm work.
      groupName: muscleGroups.name,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(
      exerciseMuscles,
      and(eq(exerciseMuscles.exerciseId, exercises.id), eq(exerciseMuscles.role, 'primary')),
    )
    .leftJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
    .leftJoin(muscleGroups, eq(muscleGroups.id, muscles.muscleGroupId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        eq(workoutSets.isCompleted, true),
        gte(workouts.startedAt, new Date(`${from}T00:00:00Z`)),
        lt(workouts.startedAt, new Date(`${toExclusive}T00:00:00Z`)),
      ),
    );
}

/**
 * Rows to attributed work, deduplicating the join's fan-out.
 *
 * The muscle-group join repeats a set once per primary group, so a set must be
 * collapsed back to one entry carrying all its groups — otherwise a two-primary
 * exercise would be counted twice and every total that included it inflated.
 */
function toAttributedWork(rows: readonly SetRow[]): AttributedWork[] {
  const bySet = new Map<string, { groups: Set<string>; row: SetRow }>();

  for (const row of rows) {
    // Keyed on the identity of the set within its session, which is what the
    // fan-out duplicates.
    const key = `${row.workoutId}:${row.exerciseId}:${row.setType}:${row.weightKg}:${row.reps}`;
    const existing = bySet.get(key) ?? { groups: new Set<string>(), row };
    if (row.groupName) existing.groups.add(row.groupName);
    bySet.set(key, existing);
  }

  const work: AttributedWork[] = [];
  for (const { groups, row } of bySet.values()) {
    const set = {
      setType: row.setType,
      weightKg: decOrNull(row.weightKg),
      reps: row.reps,
      isCompleted: true,
    };
    // Warmups and incomplete sets are excluded here exactly as they are
    // everywhere else volume is counted.
    if (!countsTowardVolume(set)) continue;

    work.push({
      primaryGroups: [...groups],
      volumeKg: setVolume(set),
      workoutId: row.workoutId,
    });
  }
  return work;
}

/** Per-exercise best estimated 1RM per session, oldest first. */
function toExerciseHistories(
  rows: readonly SetRow[],
): Map<string, { exerciseId: string; exerciseName: string; points: ExercisePoint[] }> {
  const best = new Map<string, Map<string, { e1rm: number; volume: number }>>();
  const names = new Map<string, string>();
  const seen = new Set<string>();

  for (const row of rows) {
    // The join repeats each set per muscle group; only count it once.
    const key = `${row.workoutId}:${row.exerciseId}:${row.setType}:${row.weightKg}:${row.reps}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const set = {
      setType: row.setType,
      weightKg: decOrNull(row.weightKg),
      reps: row.reps,
      isCompleted: true,
    };
    if (!countsTowardVolume(set)) continue;

    const estimate = estimate1RM(set.weightKg, set.reps);
    if (estimate === null) continue;

    names.set(row.exerciseId, row.exerciseName);
    const perDate = best.get(row.exerciseId) ?? new Map();
    const current = perDate.get(row.date) ?? { e1rm: 0, volume: 0 };
    perDate.set(row.date, {
      e1rm: Math.max(current.e1rm, decToNumber(estimate)),
      volume: current.volume + decToNumber(setVolume(set)),
    });
    best.set(row.exerciseId, perDate);
  }

  const histories = new Map<
    string,
    { exerciseId: string; exerciseName: string; points: ExercisePoint[] }
  >();

  for (const [exerciseId, perDate] of best) {
    const points = [...perDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        bestE1RM: dec(value.e1rm.toFixed(2)),
        volumeKg: dec(value.volume.toFixed(2)),
      }));

    histories.set(exerciseId, {
      exerciseId,
      exerciseName: names.get(exerciseId) ?? 'Exercise',
      points,
    });
  }
  return histories;
}

function sumVolume(work: readonly MuscleWork[]): string {
  return work.reduce((total, item) => total + decToNumber(item.volumeKg), 0).toFixed(2);
}

/**
 * The minimum history before a comparison is worth drawing.
 *
 * Two sessions. Below that the chart is one bar and the comparison is against
 * nothing, which is a worse experience than being told plainly that there is
 * not enough yet.
 */
const MIN_WORKOUTS_FOR_COMPARISON = 2;

export async function trainingInsights(
  db: Database,
  userId: string,
  window: InsightsWindow,
  today: string,
): Promise<TrainingInsights> {
  const days = WINDOW_DAYS[window];
  const from = isoDateDaysAgo(today, days - 1);
  const previousTo = isoDateDaysAgo(today, days);
  const previousFrom = isoDateDaysAgo(today, days * 2 - 1);
  // Exclusive upper bounds, so today's sessions are included and the two
  // windows cannot both claim the same day.
  const toExclusive = isoDateDaysAgo(today, -1);

  const [currentRows, previousRows] = await Promise.all([
    fetchSets(db, userId, from, toExclusive),
    fetchSets(db, userId, previousFrom, from),
  ]);

  const currentWork = muscleWork(toAttributedWork(currentRows));
  const previousWork = muscleWork(toAttributedWork(previousRows));
  const changes = compareMuscleWork(currentWork, previousWork);
  const shares = new Map(volumeShare(currentWork).map((item) => [item.group, item.percent]));

  const sessionsOf = (rows: readonly SetRow[]) => new Set(rows.map((row) => row.workoutId)).size;
  const setsOf = (work: readonly MuscleWork[]) =>
    work.reduce((total, item) => total + item.sets, 0);

  // --- the computed observations, each of which may decline to say anything.
  const histories = [...toExerciseHistories(currentRows).values()];
  const observations: Insight[] = [];

  for (const history of histories) {
    const plateau = detectPlateau(history);
    if (plateau) observations.push(plateau);

    const progression = detectProgression(history);
    if (progression) observations.push(progression);
  }

  const imbalance = detectImbalance(
    currentWork.map((item) => ({ group: item.group, volumeKg: item.volumeKg })),
  );
  if (imbalance) observations.push(imbalance);

  const [profile] = await db
    .select({ target: userProfiles.trainingDaysPerWeek })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const adherence = summariseAdherence({
    sessions: sessionsOf(currentRows),
    days,
    targetPerWeek: profile?.target ?? null,
  });
  if (adherence) observations.push(adherence);

  return {
    window,
    from,
    to: today,
    previousFrom,
    previousTo,
    muscles: changes.map((change) => ({
      group: change.group,
      volumeKg: decToString(change.currentVolumeKg),
      previousVolumeKg: decToString(change.previousVolumeKg),
      deltaVolumeKg: decToString(change.deltaVolumeKg),
      changePercent: change.changePercent,
      sharePercent: shares.get(change.group) ?? 0,
      sets: change.currentSets,
      previousSets: change.previousSets,
      workouts: change.currentWorkouts,
      previousWorkouts: change.previousWorkouts,
    })),
    totals: {
      volumeKg: sumVolume(currentWork),
      previousVolumeKg: sumVolume(previousWork),
      sets: setsOf(currentWork),
      previousSets: setsOf(previousWork),
      workouts: sessionsOf(currentRows),
      previousWorkouts: sessionsOf(previousRows),
    },
    insights: rankInsights(observations),
    hasEnoughData: sessionsOf(currentRows) >= MIN_WORKOUTS_FOR_COMPARISON,
  };
}
