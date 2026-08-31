/**
 * Routines (FR-RT-01..05).
 *
 * A routine is saved as a whole: name, notes and the ordered exercise list
 * arrive together and replace what was there. That makes reordering trivially
 * correct and removes a whole class of partial-update bugs.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Page, RoutineDetail, RoutineSummary, SaveRoutineRequest } from '@fi/shared';
import { exercises, routineExercises, routines } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { Database } from '../db/client';

const MAX_ROUTINES_LISTED = 200;

async function summaryFor(db: Database, routineIds: readonly string[]) {
  if (routineIds.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select({
      routineId: routineExercises.routineId,
      position: routineExercises.position,
      name: exercises.name,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(inArray(routineExercises.routineId, [...routineIds]))
    .orderBy(asc(routineExercises.position));

  const names = new Map<string, string[]>();
  for (const row of rows) {
    const list = names.get(row.routineId) ?? [];
    list.push(row.name);
    names.set(row.routineId, list);
  }
  return names;
}

function toSummary(
  row: typeof routines.$inferSelect,
  exerciseNames: readonly string[],
): RoutineSummary {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    exerciseCount: exerciseNames.length,
    exerciseNames: [...exerciseNames],
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRoutines(
  db: Database,
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Page<RoutineSummary>> {
  const rows = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.userId, userId),
        options.includeArchived ? undefined : isNull(routines.archivedAt),
      ),
    )
    .orderBy(desc(routines.updatedAt))
    .limit(MAX_ROUTINES_LISTED);

  const names = await summaryFor(
    db,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => toSummary(row, names.get(row.id) ?? [])),
    nextCursor: null,
  };
}

export async function getRoutine(
  db: Database,
  userId: string,
  routineId: string,
): Promise<RoutineDetail> {
  const [row] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  if (!row) throw notFound('That routine could not be found');

  const exerciseRows = await db
    .select({
      id: routineExercises.id,
      exerciseId: routineExercises.exerciseId,
      exerciseName: exercises.name,
      position: routineExercises.position,
      targetSets: routineExercises.targetSets,
      targetRepsMin: routineExercises.targetRepsMin,
      targetRepsMax: routineExercises.targetRepsMax,
      targetWeightKg: routineExercises.targetWeightKg,
      restSecs: routineExercises.restSecs,
      notes: routineExercises.notes,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(asc(routineExercises.position));

  return {
    ...toSummary(
      row,
      exerciseRows.map((exercise) => exercise.exerciseName),
    ),
    exercises: exerciseRows,
  };
}

/** Every referenced exercise must be visible to this user (NFR-S-03). */
async function assertExercisesVisible(
  db: Database,
  userId: string,
  exerciseIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(exerciseIds)];
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, unique),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    );
  if (rows.length !== unique.length) throw badRequest('One of those exercises is not available');
}

export async function saveRoutine(
  db: Database,
  userId: string,
  input: SaveRoutineRequest,
  existingId?: string,
): Promise<RoutineDetail> {
  await assertExercisesVisible(
    db,
    userId,
    input.exercises.map((exercise) => exercise.exerciseId),
  );

  const routineId = existingId ?? input.id ?? newId();
  const now = new Date();

  await db.transaction(async (tx) => {
    if (existingId) {
      const owned = await tx
        .select({ id: routines.id })
        .from(routines)
        .where(and(eq(routines.id, existingId), eq(routines.userId, userId)))
        .limit(1);
      if (owned.length === 0) throw notFound('That routine could not be found');

      await tx
        .update(routines)
        .set({ name: input.name, notes: input.notes ?? null, updatedAt: now })
        .where(eq(routines.id, existingId));
      await tx.delete(routineExercises).where(eq(routineExercises.routineId, existingId));
    } else {
      await tx.insert(routines).values({
        id: routineId,
        userId,
        name: input.name,
        notes: input.notes ?? null,
      });
    }

    await tx.insert(routineExercises).values(
      input.exercises.map((exercise, index) => ({
        id: exercise.id ?? newId(),
        routineId,
        exerciseId: exercise.exerciseId,
        // Position is the array index: the client sends the order it wants.
        position: index,
        targetSets: exercise.targetSets ?? null,
        targetRepsMin: exercise.targetRepsMin ?? null,
        targetRepsMax: exercise.targetRepsMax ?? null,
        targetWeightKg: exercise.targetWeightKg ?? null,
        restSecs: exercise.restSecs ?? null,
        notes: exercise.notes ?? null,
      })),
    );
  });

  return getRoutine(db, userId, routineId);
}

/** FR-RT-05: archived routines leave every derived workout untouched. */
export async function archiveRoutine(
  db: Database,
  userId: string,
  routineId: string,
): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(routines)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(eq(routines.id, routineId), eq(routines.userId, userId), isNull(routines.archivedAt)),
    )
    .returning({ id: routines.id });

  if (updated.length === 0) throw notFound('That routine could not be found');
}

export async function duplicateRoutine(
  db: Database,
  userId: string,
  routineId: string,
): Promise<RoutineDetail> {
  const source = await getRoutine(db, userId, routineId);
  return saveRoutine(db, userId, {
    name: `${source.name} (copy)`.slice(0, 120),
    notes: source.notes,
    exercises: source.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      targetSets: exercise.targetSets,
      targetRepsMin: exercise.targetRepsMin,
      targetRepsMax: exercise.targetRepsMax,
      targetWeightKg: exercise.targetWeightKg,
      restSecs: exercise.restSecs,
      notes: exercise.notes,
    })),
  });
}

/**
 * FR-HP-03: a past workout becomes a routine. Target sets come from what was
 * actually logged, which is the honest starting point for next time.
 */
export async function routineFromWorkout(
  db: Database,
  userId: string,
  workoutId: string,
  name: string,
): Promise<RoutineDetail> {
  const rows = await db.execute<{
    exercise_id: string;
    position: number;
    set_count: number;
    top_weight: string | null;
    min_reps: number | null;
    max_reps: number | null;
  }>(sql`
    select we.exercise_id,
           we.position,
           count(ws.id) filter (where ws.is_completed and ws.set_type <> 'warmup') as set_count,
           max(ws.weight_kg) filter (where ws.is_completed) as top_weight,
           min(ws.reps) filter (where ws.is_completed and ws.set_type <> 'warmup') as min_reps,
           max(ws.reps) filter (where ws.is_completed and ws.set_type <> 'warmup') as max_reps
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      left join workout_sets ws on ws.workout_exercise_id = we.id
     where we.workout_id = ${workoutId} and w.user_id = ${userId}
     group by we.exercise_id, we.position
     order by we.position
  `);

  if (rows.length === 0) throw notFound('That workout could not be found');

  return saveRoutine(db, userId, {
    name,
    exercises: rows.map((row) => ({
      exerciseId: row.exercise_id,
      targetSets: Number(row.set_count) > 0 ? Number(row.set_count) : null,
      targetRepsMin: row.min_reps === null ? null : Number(row.min_reps),
      targetRepsMax: row.max_reps === null ? null : Number(row.max_reps),
      targetWeightKg: row.top_weight,
    })),
  });
}
