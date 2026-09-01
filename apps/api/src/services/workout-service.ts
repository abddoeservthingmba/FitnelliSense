/**
 * Workout sessions (FR-WK-01..12, FR-HP-01..02, FR-HP-06).
 *
 * Every mutation is scoped by ownership before it touches a row, and every
 * number that ends up in the summary comes from `@fi/domain` — this file does
 * no arithmetic of its own (BRD §16.1).
 */
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  type AttributedSet,
  type Dec,
  dec,
  decOrNull,
  decToString,
  detectPRs,
  prefillSet,
  recordKey,
  totalVolume,
  completedSetCount,
} from '@fi/domain';
import type {
  AddSetRequest,
  CompleteWorkoutResponse,
  Page,
  Prefill,
  UpdateSetRequest,
  WorkoutDetail,
  WorkoutSummary,
} from '@fi/shared';
import {
  exercises,
  personalRecords,
  routineExercises,
  workoutExercises,
  workoutSets,
  workouts,
} from '../db/schema';
import { conflict, constraintName, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { decodeCursor, encodeCursor, takePage } from '../lib/cursor';
import type { Database } from '../db/client';

const ACTIVE_WORKOUT_CONSTRAINT = 'idx_one_active_workout';

type WorkoutRow = typeof workouts.$inferSelect;
type SetRow = typeof workoutSets.$inferSelect;

// ---------------------------------------------------------------- ownership --

/** The gate every mutation passes through first (NFR-S-03). */
async function ownedWorkout(db: Database, userId: string, workoutId: string): Promise<WorkoutRow> {
  const [row] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  if (!row) throw notFound('That workout could not be found');
  return row;
}

async function ownedInProgressWorkout(
  db: Database,
  userId: string,
  workoutId: string,
): Promise<WorkoutRow> {
  const row = await ownedWorkout(db, userId, workoutId);
  if (row.status !== 'in_progress') throw conflict('That workout is already finished');
  return row;
}

async function ownedWorkoutExercise(
  db: Database,
  userId: string,
  workoutId: string,
  workoutExerciseId: string,
): Promise<typeof workoutExercises.$inferSelect> {
  await ownedWorkout(db, userId, workoutId);
  const [row] = await db
    .select()
    .from(workoutExercises)
    .where(
      and(eq(workoutExercises.id, workoutExerciseId), eq(workoutExercises.workoutId, workoutId)),
    )
    .limit(1);
  if (!row) throw notFound('That exercise is not in this workout');
  return row;
}

/** A set is reached by its own id, so ownership is proven by joining upward. */
async function ownedSet(
  db: Database,
  userId: string,
  setId: string,
): Promise<{ set: SetRow; workoutId: string; exerciseId: string }> {
  const [row] = await db
    .select({
      set: workoutSets,
      workoutId: workouts.id,
      exerciseId: workoutExercises.exerciseId,
      status: workouts.status,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutSets.id, setId), eq(workouts.userId, userId)))
    .limit(1);

  if (!row) throw notFound('That set could not be found');
  if (row.status !== 'in_progress') throw conflict('That workout is already finished');
  return { set: row.set, workoutId: row.workoutId, exerciseId: row.exerciseId };
}

// ------------------------------------------------------------------- reading --

/** Append at the end. Positions are contiguous from zero and unique per parent. */
async function nextPosition(
  db: Database,
  table: typeof workoutExercises | typeof workoutSets,
  where: SQL,
): Promise<number> {
  const [row] = await db
    .select({ highest: sql<number | null>`max(${table.position})` })
    .from(table)
    .where(where);
  return (row?.highest ?? -1) + 1;
}

function toSummary(row: WorkoutRow, exerciseNames: string[], setCount: number): WorkoutSummary {
  return {
    id: row.id,
    routineId: row.routineId,
    name: row.name,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationSecs: row.durationSecs,
    totalVolumeKg: row.totalVolumeKg,
    setCount,
    exerciseNames,
  };
}

export async function getWorkoutDetail(
  db: Database,
  userId: string,
  workoutId: string,
): Promise<WorkoutDetail> {
  const row = await ownedWorkout(db, userId, workoutId);

  const exerciseRows = await db
    .select({
      id: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      exerciseName: exercises.name,
      position: workoutExercises.position,
      restSecs: workoutExercises.restSecs,
      notes: workoutExercises.notes,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position));

  const setRows = await db
    .select({ set: workoutSets })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutSets.position));

  const setsByExercise = new Map<string, SetRow[]>();
  for (const { set } of setRows) {
    const list = setsByExercise.get(set.workoutExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.workoutExerciseId, list);
  }

  return {
    ...toSummary(
      row,
      exerciseRows.map((exercise) => exercise.exerciseName),
      setRows.length,
    ),
    notes: row.notes,
    exercises: exerciseRows.map((exercise) => ({
      ...exercise,
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        id: set.id,
        position: set.position,
        setType: set.setType,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe === null ? null : Number(set.rpe),
        isCompleted: set.isCompleted,
        completedAt: set.completedAt?.toISOString() ?? null,
        notes: set.notes,
      })),
    })),
  };
}

export async function getActiveWorkout(
  db: Database,
  userId: string,
): Promise<WorkoutDetail | null> {
  const [row] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.status, 'in_progress')))
    .limit(1);

  return row ? getWorkoutDetail(db, userId, row.id) : null;
}

/** FR-HP-01: newest first, keyset paginated on (startedAt, id). */
export async function listWorkouts(
  db: Database,
  userId: string,
  query: { limit: number; cursor?: string; from?: string; to?: string },
): Promise<Page<WorkoutSummary>> {
  const conditions: (SQL | undefined)[] = [
    eq(workouts.userId, userId),
    eq(workouts.status, 'completed'),
  ];

  if (query.from) conditions.push(gt(workouts.startedAt, new Date(query.from)));
  if (query.to) conditions.push(lt(workouts.startedAt, new Date(query.to)));

  if (query.cursor) {
    const [startedAt, id] = decodeCursor(query.cursor);
    if (typeof startedAt === 'string' && typeof id === 'string') {
      const at = new Date(startedAt);
      conditions.push(
        or(lt(workouts.startedAt, at), and(eq(workouts.startedAt, at), lt(workouts.id, id))),
      );
    }
  }

  const rows = await db
    .select()
    .from(workouts)
    .where(and(...conditions.filter((condition): condition is SQL => condition !== undefined)))
    .orderBy(desc(workouts.startedAt), desc(workouts.id))
    .limit(query.limit + 1);

  const page = takePage(rows, query.limit, (row) =>
    encodeCursor([row.startedAt.toISOString(), row.id]),
  );

  const counts = await countsFor(
    db,
    page.items.map((row) => row.id),
  );

  return {
    items: page.items.map((row) => {
      const summary = counts.get(row.id) ?? { setCount: 0, exerciseNames: [] };
      return toSummary(row, summary.exerciseNames, summary.setCount);
    }),
    nextCursor: page.nextCursor,
  };
}

/** Exercise names and set counts for a page of history, in one query. */
async function countsFor(
  db: Database,
  workoutIds: readonly string[],
): Promise<Map<string, { setCount: number; exerciseNames: string[] }>> {
  const result = new Map<string, { setCount: number; exerciseNames: string[] }>();
  if (workoutIds.length === 0) return result;

  const rows = await db
    .select({
      workoutId: workoutExercises.workoutId,
      exerciseName: exercises.name,
      position: workoutExercises.position,
      setCount: sql<number>`count(${workoutSets.id})`,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(inArray(workoutExercises.workoutId, [...workoutIds]))
    .groupBy(workoutExercises.workoutId, exercises.name, workoutExercises.position)
    .orderBy(asc(workoutExercises.workoutId), asc(workoutExercises.position));

  for (const row of rows) {
    const entry = result.get(row.workoutId) ?? { setCount: 0, exerciseNames: [] };
    entry.exerciseNames.push(row.exerciseName);
    entry.setCount += Number(row.setCount);
    result.set(row.workoutId, entry);
  }
  return result;
}

// ------------------------------------------------------------------- writing --

export async function startWorkout(
  db: Database,
  userId: string,
  input: { id: string; routineId?: string | null; name?: string | null; startedAt: string },
): Promise<WorkoutDetail> {
  // A replayed start for the same id is the same workout, not a second one.
  const [existing] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, input.id), eq(workouts.userId, userId)))
    .limit(1);
  if (existing) return getWorkoutDetail(db, userId, input.id);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(workouts).values({
        id: input.id,
        userId,
        routineId: input.routineId ?? null,
        name: input.name ?? null,
        startedAt: new Date(input.startedAt),
      });

      // FR-WK-01: starting from a routine prefills the exercise list in order.
      if (input.routineId) {
        const template = await tx
          .select({
            exerciseId: routineExercises.exerciseId,
            position: routineExercises.position,
            restSecs: routineExercises.restSecs,
          })
          .from(routineExercises)
          .where(eq(routineExercises.routineId, input.routineId))
          .orderBy(asc(routineExercises.position));

        if (template.length > 0) {
          await tx.insert(workoutExercises).values(
            template.map((entry, index) => ({
              id: newId(),
              workoutId: input.id,
              exerciseId: entry.exerciseId,
              position: index,
              restSecs: entry.restSecs,
            })),
          );
        }
      }
    });
  } catch (error) {
    // FR-WK-02 is enforced by a partial unique index, so the race is the
    // database's to lose, not ours.
    if (constraintName(error) === ACTIVE_WORKOUT_CONSTRAINT) {
      throw conflict('You already have a workout in progress');
    }
    throw error;
  }

  return getWorkoutDetail(db, userId, input.id);
}

export async function updateWorkout(
  db: Database,
  userId: string,
  workoutId: string,
  input: { name?: string | null; notes?: string | null },
): Promise<WorkoutDetail> {
  await ownedWorkout(db, userId, workoutId);
  const patch: Partial<typeof workouts.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.notes !== undefined) patch.notes = input.notes;

  await db.update(workouts).set(patch).where(eq(workouts.id, workoutId));
  return getWorkoutDetail(db, userId, workoutId);
}

export async function addExerciseToWorkout(
  db: Database,
  userId: string,
  workoutId: string,
  input: { id: string; exerciseId: string; restSecs?: number | null },
): Promise<WorkoutDetail> {
  await ownedInProgressWorkout(db, userId, workoutId);

  const [existing] = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.id, input.id))
    .limit(1);
  if (existing) return getWorkoutDetail(db, userId, workoutId);

  const position = await nextPosition(
    db,
    workoutExercises,
    eq(workoutExercises.workoutId, workoutId),
  );

  await db.insert(workoutExercises).values({
    id: input.id,
    workoutId,
    exerciseId: input.exerciseId,
    position,
    restSecs: input.restSecs ?? null,
  });

  return getWorkoutDetail(db, userId, workoutId);
}

/**
 * Reorder by sending the full list of ids. Positions are rewritten in two
 * passes because `(workout_id, position)` is unique — the intermediate
 * negative positions keep the constraint satisfied mid-update.
 */
export async function reorderWorkoutExercises(
  db: Database,
  userId: string,
  workoutId: string,
  orderedIds: readonly string[],
): Promise<WorkoutDetail> {
  await ownedInProgressWorkout(db, userId, workoutId);

  const rows = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));

  const known = new Set(rows.map((row) => row.id));
  if (known.size !== orderedIds.length || orderedIds.some((id) => !known.has(id))) {
    throw conflict('Send every exercise in the workout, in the order you want');
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(workoutExercises)
        .set({ position: -(index + 1) })
        .where(eq(workoutExercises.id, id));
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(workoutExercises).set({ position: index }).where(eq(workoutExercises.id, id));
    }
  });

  return getWorkoutDetail(db, userId, workoutId);
}

export async function removeWorkoutExercise(
  db: Database,
  userId: string,
  workoutId: string,
  workoutExerciseId: string,
): Promise<WorkoutDetail> {
  await ownedInProgressWorkout(db, userId, workoutId);
  await ownedWorkoutExercise(db, userId, workoutId, workoutExerciseId);
  await db.delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId));
  return getWorkoutDetail(db, userId, workoutId);
}

export async function addSet(
  db: Database,
  userId: string,
  workoutId: string,
  workoutExerciseId: string,
  input: AddSetRequest,
): Promise<WorkoutDetail> {
  await ownedInProgressWorkout(db, userId, workoutId);
  await ownedWorkoutExercise(db, userId, workoutId, workoutExerciseId);

  const [existing] = await db
    .select({ id: workoutSets.id })
    .from(workoutSets)
    .where(eq(workoutSets.id, input.id))
    .limit(1);
  if (existing) return getWorkoutDetail(db, userId, workoutId);

  const position = await nextPosition(
    db,
    workoutSets,
    eq(workoutSets.workoutExerciseId, workoutExerciseId),
  );

  await db.insert(workoutSets).values({
    id: input.id,
    workoutExerciseId,
    position,
    setType: input.setType,
    weightKg: input.weightKg ?? null,
    reps: input.reps ?? null,
    rpe: input.rpe === null || input.rpe === undefined ? null : String(input.rpe),
    isCompleted: input.isCompleted,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    notes: input.notes ?? null,
  });

  return getWorkoutDetail(db, userId, workoutId);
}

export async function updateSet(
  db: Database,
  userId: string,
  setId: string,
  input: UpdateSetRequest,
): Promise<WorkoutDetail> {
  const { workoutId } = await ownedSet(db, userId, setId);

  const patch: Partial<typeof workoutSets.$inferInsert> = {};
  if (input.setType !== undefined) patch.setType = input.setType;
  if (input.weightKg !== undefined) patch.weightKg = input.weightKg ?? null;
  if (input.reps !== undefined) patch.reps = input.reps ?? null;
  if (input.rpe !== undefined) patch.rpe = input.rpe === null ? null : String(input.rpe);
  if (input.notes !== undefined) patch.notes = input.notes ?? null;
  if (input.isCompleted !== undefined) {
    patch.isCompleted = input.isCompleted;
    // Completion time is derived unless the client supplies it, which it does
    // when replaying a set logged offline.
    patch.completedAt = input.isCompleted
      ? new Date(input.completedAt ?? Date.now())
      : null;
  } else if (input.completedAt !== undefined) {
    patch.completedAt = input.completedAt ? new Date(input.completedAt) : null;
  }

  await db.update(workoutSets).set(patch).where(eq(workoutSets.id, setId));
  return getWorkoutDetail(db, userId, workoutId);
}

export async function deleteSet(
  db: Database,
  userId: string,
  setId: string,
): Promise<WorkoutDetail> {
  const { workoutId } = await ownedSet(db, userId, setId);
  await db.delete(workoutSets).where(eq(workoutSets.id, setId));
  return getWorkoutDetail(db, userId, workoutId);
}

export async function discardWorkout(
  db: Database,
  userId: string,
  workoutId: string,
): Promise<void> {
  await ownedInProgressWorkout(db, userId, workoutId);
  await db
    .update(workouts)
    .set({ status: 'discarded', updatedAt: new Date() })
    .where(eq(workouts.id, workoutId));
}

// ---------------------------------------------------------------- completion --

/** Every logged set of a workout, in the shape `@fi/domain` expects. */
async function attributedSets(db: Database, workoutId: string): Promise<AttributedSet[]> {
  const rows = await db
    .select({
      id: workoutSets.id,
      exerciseId: workoutExercises.exerciseId,
      setType: workoutSets.setType,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      isCompleted: workoutSets.isCompleted,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .where(eq(workoutExercises.workoutId, workoutId));

  return rows.map((row) => ({
    id: row.id,
    exerciseId: row.exerciseId,
    setType: row.setType,
    weightKg: decOrNull(row.weightKg),
    reps: row.reps,
    isCompleted: row.isCompleted,
  }));
}

/** The user's current best per exercise and record type (FR-HP-06). */
async function existingRecords(
  db: Database,
  userId: string,
  exerciseIds: readonly string[],
): Promise<Map<string, Dec>> {
  const best = new Map<string, Dec>();
  if (exerciseIds.length === 0) return best;

  const rows = await db
    .select({
      exerciseId: personalRecords.exerciseId,
      prType: personalRecords.prType,
      value: sql<string>`max(${personalRecords.value})`,
    })
    .from(personalRecords)
    .where(
      and(
        eq(personalRecords.userId, userId),
        inArray(personalRecords.exerciseId, [...exerciseIds]),
      ),
    )
    .groupBy(personalRecords.exerciseId, personalRecords.prType);

  for (const row of rows) best.set(recordKey(row.exerciseId, row.prType), dec(row.value));
  return best;
}

/**
 * FR-WK-10 + FR-HP-06. Duration, volume and records are all computed here, in
 * one transaction, from the domain module — so finishing a workout twice cannot
 * produce two sets of records.
 */
export async function completeWorkout(
  db: Database,
  userId: string,
  workoutId: string,
  completedAt: string,
): Promise<CompleteWorkoutResponse> {
  const workout = await ownedInProgressWorkout(db, userId, workoutId);

  const sets = await attributedSets(db, workoutId);
  const volume = totalVolume(sets);
  const finishedAt = new Date(completedAt);
  const durationSecs = Math.max(
    0,
    Math.round((finishedAt.getTime() - workout.startedAt.getTime()) / 1000),
  );

  const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))];
  const records = detectPRs(sets, await existingRecords(db, userId, exerciseIds));

  await db.transaction(async (tx) => {
    await tx
      .update(workouts)
      .set({
        status: 'completed',
        completedAt: finishedAt,
        durationSecs,
        totalVolumeKg: decToString(volume),
        updatedAt: new Date(),
      })
      .where(and(eq(workouts.id, workoutId), eq(workouts.status, 'in_progress')));

    if (records.length > 0) {
      await tx.insert(personalRecords).values(
        records.map((record) => ({
          id: newId(),
          userId,
          exerciseId: record.exerciseId,
          prType: record.prType,
          value: decToString(record.value),
          reps: record.reps,
          weightKg: record.weightKg === null ? null : decToString(record.weightKg),
          setId: record.setId,
          achievedAt: finishedAt,
        })),
      );
    }
  });

  const names = await exerciseNames(db, exerciseIds);
  const summary = await getWorkoutDetail(db, userId, workoutId);

  return {
    workout: {
      ...summary,
      setCount: completedSetCount(sets),
    },
    personalRecords: records.map((record) => ({
      exerciseId: record.exerciseId,
      exerciseName: names.get(record.exerciseId) ?? 'Exercise',
      prType: record.prType,
      value: decToString(record.value),
      weightKg: record.weightKg === null ? null : decToString(record.weightKg),
      reps: record.reps,
      previousValue: record.previousValue === null ? null : decToString(record.previousValue),
    })),
  };
}

async function exerciseNames(
  db: Database,
  exerciseIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (exerciseIds.length === 0) return names;
  const rows = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(inArray(exercises.id, [...exerciseIds]));
  for (const row of rows) names.set(row.id, row.name);
  return names;
}

// ------------------------------------------------------------------- prefill --

/**
 * FR-WK-06: the prefill chain, resolved server-side so a fresh device gets the
 * same suggestion as one with local history. The order itself lives in
 * `@fi/domain`; this only gathers the candidates.
 */
export async function getPrefill(
  db: Database,
  userId: string,
  input: { exerciseId: string; workoutId?: string; routineId?: string },
): Promise<Prefill> {
  const previousSet = input.workoutId
    ? await lastSetInWorkout(db, input.workoutId, input.exerciseId)
    : null;

  const lastSession = await topSetLastSession(db, userId, input.exerciseId, input.workoutId);

  const routineTarget = input.routineId
    ? await routineTargetFor(db, input.routineId, input.exerciseId)
    : null;

  const result = prefillSet({ previousSet, lastSession, routineTarget });
  return {
    weightKg: result.weightKg === null ? null : decToString(result.weightKg),
    reps: result.reps,
    origin: result.origin,
  };
}

async function lastSetInWorkout(db: Database, workoutId: string, exerciseId: string) {
  const [row] = await db
    .select({ weightKg: workoutSets.weightKg, reps: workoutSets.reps })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .where(
      and(
        eq(workoutExercises.workoutId, workoutId),
        eq(workoutExercises.exerciseId, exerciseId),
        eq(workoutSets.isCompleted, true),
      ),
    )
    .orderBy(desc(workoutSets.position))
    .limit(1);

  return row ? { weightKg: decOrNull(row.weightKg), reps: row.reps } : null;
}

async function topSetLastSession(
  db: Database,
  userId: string,
  exerciseId: string,
  excludeWorkoutId?: string,
) {
  const [row] = await db
    .select({ weightKg: workoutSets.weightKg, reps: workoutSets.reps })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        eq(workoutExercises.exerciseId, exerciseId),
        eq(workoutSets.isCompleted, true),
        excludeWorkoutId ? ne(workouts.id, excludeWorkoutId) : undefined,
      ),
    )
    .orderBy(desc(workouts.startedAt), desc(workoutSets.weightKg))
    .limit(1);

  return row ? { weightKg: decOrNull(row.weightKg), reps: row.reps } : null;
}

async function routineTargetFor(db: Database, routineId: string, exerciseId: string) {
  const [row] = await db
    .select({
      targetWeightKg: routineExercises.targetWeightKg,
      targetRepsMin: routineExercises.targetRepsMin,
      targetRepsMax: routineExercises.targetRepsMax,
    })
    .from(routineExercises)
    .where(
      and(eq(routineExercises.routineId, routineId), eq(routineExercises.exerciseId, exerciseId)),
    )
    .limit(1);

  return row
    ? {
        targetWeightKg: decOrNull(row.targetWeightKg),
        targetRepsMin: row.targetRepsMin,
        targetRepsMax: row.targetRepsMax,
      }
    : null;
}
