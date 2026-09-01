/**
 * Progress and records (FR-HP-04..07).
 *
 * The database groups sets into sessions; `@fi/domain` turns them into metric
 * values. Splitting it that way keeps the arithmetic unit-tested and identical
 * to what the client would compute from the same rows.
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  ONE_RM_FORMULA_TEXT,
  currentStreakDays,
  dec,
  decToString,
  isoDateDaysAgo,
  progressSeries,
  volumeSince,
  type LoggedSet,
  type ProgressMetric,
  type SessionSets,
} from '@fi/domain';
import type { PersonalRecord, ProgressSeriesResponse, ProgressSummaryResponse } from '@fi/shared';
import { exercises, personalRecords, workoutExercises, workoutSets, workouts } from '../db/schema';
import { notFound } from '../lib/errors';
import type { Database } from '../db/client';

/** Only estimated 1RM is a formula worth attributing on the chart (FR-HP-05). */
function formulaFor(metric: ProgressMetric): string | null {
  return metric === 'estimated_1rm' ? ONE_RM_FORMULA_TEXT : null;
}

export async function exerciseProgress(
  db: Database,
  userId: string,
  exerciseId: string,
  query: { metric: ProgressMetric; from?: string; to?: string },
): Promise<ProgressSeriesResponse> {
  const [exercise] = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);
  if (!exercise) throw notFound('That exercise could not be found');

  const rows = await db
    .select({
      // The session's calendar day; charts plot one point per session.
      date: sql<string>`to_char(${workouts.startedAt}, 'YYYY-MM-DD')`,
      setType: workoutSets.setType,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      isCompleted: workoutSets.isCompleted,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        eq(workoutExercises.exerciseId, exerciseId),
        query.from ? gte(workouts.startedAt, new Date(query.from)) : undefined,
        query.to ? lte(workouts.startedAt, new Date(`${query.to}T23:59:59Z`)) : undefined,
      ),
    )
    .orderBy(desc(workouts.startedAt));

  const bySession = new Map<string, LoggedSet[]>();
  for (const row of rows) {
    const sets = bySession.get(row.date) ?? [];
    sets.push({
      setType: row.setType,
      weightKg: row.weightKg === null ? null : dec(row.weightKg),
      reps: row.reps,
      isCompleted: row.isCompleted,
    });
    bySession.set(row.date, sets);
  }

  const sessions: SessionSets[] = [...bySession].map(([date, sets]) => ({ date, sets }));

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    metric: query.metric,
    formula: formulaFor(query.metric),
    points: progressSeries(sessions, query.metric).map((point) => ({
      date: point.date,
      value: decToString(point.value),
    })),
  };
}

export async function listRecords(db: Database, userId: string): Promise<PersonalRecord[]> {
  const rows = await db
    .select({
      id: personalRecords.id,
      exerciseId: personalRecords.exerciseId,
      exerciseName: exercises.name,
      prType: personalRecords.prType,
      value: personalRecords.value,
      weightKg: personalRecords.weightKg,
      reps: personalRecords.reps,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(eq(personalRecords.userId, userId))
    .orderBy(desc(personalRecords.achievedAt));

  // Only the current best per exercise and type is a "record"; the rest are
  // history and belong on the chart, not in this list.
  const best = new Map<string, PersonalRecord>();
  for (const row of rows) {
    const key = `${row.exerciseId}:${row.prType}`;
    const incumbent = best.get(key);
    const record: PersonalRecord = { ...row, achievedAt: row.achievedAt.toISOString() };
    if (!incumbent || Number(record.value) > Number(incumbent.value)) best.set(key, record);
  }

  return [...best.values()].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
}

const RECENT_RECORD_COUNT = 5;

export async function progressSummary(
  db: Database,
  userId: string,
  today: string,
): Promise<ProgressSummaryResponse> {
  const since = isoDateDaysAgo(today, 30);

  const sessions = await db
    .select({
      date: sql<string>`to_char(${workouts.startedAt}, 'YYYY-MM-DD')`,
      volumeKg: workouts.totalVolumeKg,
      startedAt: workouts.startedAt,
    })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        gte(workouts.startedAt, new Date(`${since}T00:00:00Z`)),
      ),
    )
    .orderBy(desc(workouts.startedAt));

  const [allDates, lastWorkout] = await Promise.all([
    db
      .select({ date: sql<string>`to_char(${workouts.startedAt}, 'YYYY-MM-DD')` })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), eq(workouts.status, 'completed')))
      .orderBy(desc(workouts.startedAt))
      .limit(400),
    db
      .select({ startedAt: workouts.startedAt })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), eq(workouts.status, 'completed')))
      .orderBy(desc(workouts.startedAt))
      .limit(1),
  ]);

  const volumes = sessions.map((session) => ({
    date: session.date,
    volumeKg: dec(session.volumeKg ?? '0'),
  }));

  const weekStart = isoDateDaysAgo(today, 6);
  const records = await listRecords(db, userId);

  return {
    workoutsThisWeek: sessions.filter((session) => session.date >= weekStart).length,
    currentStreakDays: currentStreakDays(
      allDates.map((row) => row.date),
      today,
    ),
    volume7dKg: decToString(volumeSince(volumes, weekStart)),
    volume30dKg: decToString(volumeSince(volumes, since)),
    lastWorkoutAt: lastWorkout[0]?.startedAt.toISOString() ?? null,
    recentRecords: records.slice(0, RECENT_RECORD_COUNT),
  };
}

/** Used by the history screen to show which exercises a workout contained. */
export async function exerciseNamesFor(
  db: Database,
  exerciseIds: readonly string[],
): Promise<Map<string, string>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(inArray(exercises.id, [...exerciseIds]));
  return new Map(rows.map((row) => [row.id, row.name]));
}
