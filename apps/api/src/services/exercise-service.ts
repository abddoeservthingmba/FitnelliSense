/**
 * Exercise library reads and custom-exercise writes (FR-EX-01..09).
 *
 * Visibility rule, applied to every query: a user sees the system catalogue
 * (`user_id IS NULL`) plus their own custom exercises, and nobody else's.
 */
import { and, asc, eq, exists, gt, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type {
  CreateExerciseRequest,
  ExerciseDetail,
  ExerciseSummary,
  ListExercisesQuery,
  Page,
  UpdateExerciseRequest,
} from '@fi/shared';
import {
  equipment,
  exerciseMedia,
  exerciseMuscles,
  exercises,
  mediaAssets,
  muscleGroups,
  muscles,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { decodeCursor, encodeCursor, takePage } from '../lib/cursor';
import { isRenderable } from './media-service';
import type { Database } from '../db/client';

/** The visibility predicate, in one place so no query can forget it. */
function visibleTo(userId: string): SQL {
  const predicate = or(isNull(exercises.userId), eq(exercises.userId, userId));
  if (!predicate) throw new Error('unreachable: visibility predicate');
  return predicate;
}

/**
 * FR-EX-05 asks for a name match, but a name match alone fails the way people
 * actually search: "arms", "shoulders", "dumbbell" are the words that come to
 * mind, and none of them appear in an exercise name. So the query also matches
 * the taxonomy — muscle, muscle group and equipment — and an exercise counts as
 * a hit on any of them.
 *
 * `ILIKE` uses the trigram index for the contains case, which is all a
 * 500-row library needs (§3.3.1 — no Elasticsearch).
 */
function searchMatches(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const pattern = `%${trimmed}%`;

  const byMuscleOrGroup = exists(
    sql`(select 1 from ${exerciseMuscles}
          join ${muscles} on ${muscles.id} = ${exerciseMuscles.muscleId}
          join ${muscleGroups} on ${muscleGroups.id} = ${muscles.muscleGroupId}
         where ${exerciseMuscles.exerciseId} = ${exercises.id}
           and (${muscles.name} ilike ${pattern} or ${muscleGroups.name} ilike ${pattern}))`,
  );

  const byEquipment = exists(
    sql`(select 1 from ${equipment}
         where ${equipment.id} = ${exercises.equipmentId}
           and ${equipment.name} ilike ${pattern})`,
  );

  const predicate = or(ilike(exercises.name, pattern), byMuscleOrGroup, byEquipment);
  if (!predicate) throw new Error('unreachable: search predicate');
  return predicate;
}

function muscleFilter(input: { muscleId?: number; muscleGroupId?: number }): SQL | undefined {
  if (input.muscleId !== undefined) {
    return exists(
      sql`(select 1 from ${exerciseMuscles}
           where ${exerciseMuscles.exerciseId} = ${exercises.id}
             and ${exerciseMuscles.muscleId} = ${input.muscleId})`,
    );
  }
  if (input.muscleGroupId !== undefined) {
    return exists(
      sql`(select 1 from ${exerciseMuscles}
           join ${muscles} on ${muscles.id} = ${exerciseMuscles.muscleId}
           where ${exerciseMuscles.exerciseId} = ${exercises.id}
             and ${muscles.muscleGroupId} = ${input.muscleGroupId})`,
    );
  }
  return undefined;
}

/**
 * Primary muscles and the primary media id for a page of exercises, in two
 * queries rather than two per row.
 */
async function decorate(
  db: Database,
  rows: readonly (typeof exercises.$inferSelect)[],
): Promise<Map<string, { primaryMuscleIds: number[]; primaryMediaId: string | null }>> {
  const decorated = new Map<
    string,
    { primaryMuscleIds: number[]; primaryMediaId: string | null }
  >();
  for (const row of rows) decorated.set(row.id, { primaryMuscleIds: [], primaryMediaId: null });
  if (rows.length === 0) return decorated;

  const ids = rows.map((row) => row.id);

  const muscleRows = await db
    .select({ exerciseId: exerciseMuscles.exerciseId, muscleId: exerciseMuscles.muscleId })
    .from(exerciseMuscles)
    .where(and(inArray(exerciseMuscles.exerciseId, ids), eq(exerciseMuscles.role, 'primary')));

  for (const row of muscleRows) decorated.get(row.exerciseId)?.primaryMuscleIds.push(row.muscleId);

  // Only renderable assets are offered to the client (FR-MED-03, FR-MED-08).
  const mediaRows = await db
    .select({
      exerciseId: exerciseMedia.exerciseId,
      mediaId: mediaAssets.id,
      state: mediaAssets.state,
      licence: mediaAssets.licence,
    })
    .from(exerciseMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, exerciseMedia.mediaId))
    .where(and(inArray(exerciseMedia.exerciseId, ids), eq(exerciseMedia.isPrimary, true)));

  for (const row of mediaRows) {
    if (!isRenderable(row)) continue;
    const entry = decorated.get(row.exerciseId);
    if (entry) entry.primaryMediaId = row.mediaId;
  }

  return decorated;
}

function toSummary(
  row: typeof exercises.$inferSelect,
  extra: { primaryMuscleIds: number[]; primaryMediaId: string | null },
): ExerciseSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    equipmentId: row.equipmentId,
    kind: row.kind,
    isUnilateral: row.isUnilateral,
    isCustom: row.userId !== null,
    primaryMuscleIds: extra.primaryMuscleIds,
    primaryMediaId: extra.primaryMediaId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export async function listExercises(
  db: Database,
  userId: string,
  query: ListExercisesQuery,
): Promise<Page<ExerciseSummary>> {
  const conditions: (SQL | undefined)[] = [visibleTo(userId)];

  if (query.scope === 'custom') conditions.push(eq(exercises.userId, userId));
  if (query.scope === 'system') conditions.push(isNull(exercises.userId));
  if (!query.includeArchived) conditions.push(isNull(exercises.archivedAt));
  if (query.q) conditions.push(searchMatches(query.q));
  if (query.equipmentId !== undefined)
    conditions.push(eq(exercises.equipmentId, query.equipmentId));

  const muscle = muscleFilter(query);
  if (muscle) conditions.push(muscle);

  // Keyset pagination on (name, id): a stable order for an alphabetical list.
  if (query.cursor) {
    const [name, id] = decodeCursor(query.cursor);
    if (typeof name === 'string' && typeof id === 'string') {
      conditions.push(
        or(gt(exercises.name, name), and(eq(exercises.name, name), gt(exercises.id, id))),
      );
    }
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conditions.filter((condition): condition is SQL => condition !== undefined)))
    .orderBy(asc(exercises.name), asc(exercises.id))
    .limit(query.limit + 1);

  const page = takePage(rows, query.limit, (row) => encodeCursor([row.name, row.id]));
  const extras = await decorate(db, page.items);

  return {
    items: page.items.map((row) =>
      toSummary(row, extras.get(row.id) ?? { primaryMuscleIds: [], primaryMediaId: null }),
    ),
    nextCursor: page.nextCursor,
  };
}

export async function getExercise(
  db: Database,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetail> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), visibleTo(userId)))
    .limit(1);

  if (!row) throw notFound('That exercise could not be found');

  const muscleRows = await db
    .select({ muscleId: exerciseMuscles.muscleId, role: exerciseMuscles.role })
    .from(exerciseMuscles)
    .where(eq(exerciseMuscles.exerciseId, row.id));

  const mediaRows = await db
    .select({
      mediaId: mediaAssets.id,
      kind: mediaAssets.kind,
      isPrimary: exerciseMedia.isPrimary,
      position: exerciseMedia.position,
      width: mediaAssets.width,
      height: mediaAssets.height,
      state: mediaAssets.state,
      licence: mediaAssets.licence,
    })
    .from(exerciseMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, exerciseMedia.mediaId))
    .where(eq(exerciseMedia.exerciseId, row.id))
    .orderBy(asc(exerciseMedia.position));

  const media = mediaRows.filter(isRenderable);
  const primary = media.find((asset) => asset.isPrimary);

  return {
    ...toSummary(row, {
      primaryMuscleIds: muscleRows
        .filter((muscle) => muscle.role === 'primary')
        .map((muscle) => muscle.muscleId),
      primaryMediaId: primary?.mediaId ?? null,
    }),
    description: row.description,
    instructions: row.instructions,
    muscles: muscleRows,
    media: media.map((asset) => ({
      mediaId: asset.mediaId,
      kind: asset.kind,
      isPrimary: asset.isPrimary,
      width: asset.width,
      height: asset.height,
    })),
  };
}

export async function createCustomExercise(
  db: Database,
  userId: string,
  input: CreateExerciseRequest,
): Promise<ExerciseDetail> {
  const id = input.id ?? newId();

  await db.transaction(async (tx) => {
    await tx.insert(exercises).values({
      id,
      userId,
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      equipmentId: input.equipmentId ?? null,
      kind: input.kind,
      isUnilateral: input.isUnilateral,
    });
    await tx
      .insert(exerciseMuscles)
      .values(input.muscles.map((muscle) => ({ exerciseId: id, ...muscle })));
  });

  return getExercise(db, userId, id);
}

/** Only a user's own custom exercise is editable; system rows go via /admin. */
async function ownCustomExercise(db: Database, userId: string, exerciseId: string): Promise<void> {
  const [row] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .limit(1);
  if (!row) throw notFound('That exercise could not be found');
}

export async function updateCustomExercise(
  db: Database,
  userId: string,
  exerciseId: string,
  input: UpdateExerciseRequest,
): Promise<ExerciseDetail> {
  await ownCustomExercise(db, userId, exerciseId);

  await db.transaction(async (tx) => {
    const patch: Partial<typeof exercises.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.instructions !== undefined) patch.instructions = input.instructions ?? null;
    if (input.equipmentId !== undefined) patch.equipmentId = input.equipmentId ?? null;
    if (input.isUnilateral !== undefined) patch.isUnilateral = input.isUnilateral;

    await tx.update(exercises).set(patch).where(eq(exercises.id, exerciseId));

    if (input.muscles !== undefined) {
      await tx.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, exerciseId));
      await tx
        .insert(exerciseMuscles)
        .values(input.muscles.map((muscle) => ({ exerciseId, ...muscle })));
    }
  });

  return getExercise(db, userId, exerciseId);
}

/** FR-EX-09: archive, never delete, so historical workouts keep their names. */
export async function archiveCustomExercise(
  db: Database,
  userId: string,
  exerciseId: string,
): Promise<void> {
  await ownCustomExercise(db, userId, exerciseId);
  const now = new Date();
  const updated = await db
    .update(exercises)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(exercises.id, exerciseId), isNull(exercises.archivedAt)))
    .returning({ id: exercises.id });

  if (updated.length === 0) throw conflict('That exercise is already archived');
}
