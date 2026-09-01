/**
 * Data export (FR-AUTH-09, NFR-B-10).
 *
 * Treated as the user's escape hatch: it must keep working whenever the API is
 * up, independent of any other feature's health, so it reads plain rows and
 * depends on nothing but the database.
 */
import { desc, eq, inArray } from 'drizzle-orm';
import {
  bodyMeasurements,
  exercises,
  foodEntries,
  foods,
  personalRecords,
  routineExercises,
  routines,
  userProfiles,
  users,
  workoutExercises,
  workoutSets,
  workouts,
} from '../db/schema';
import { notFound } from '../lib/errors';
import type { Database } from '../db/client';

export async function exportUserData(db: Database, userId: string): Promise<Record<string, unknown>> {
  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      displayName: userProfiles.displayName,
      units: userProfiles.units,
      experience: userProfiles.experience,
      bodyweightKg: userProfiles.bodyweightKg,
      defaultRestSecs: userProfiles.defaultRestSecs,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!account) throw notFound('That account could not be found');

  const ownWorkouts = await db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.startedAt));

  const workoutIds = ownWorkouts.map((workout) => workout.id);
  const ownWorkoutExercises = workoutIds.length
    ? await db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds))
    : [];

  const workoutExerciseIds = ownWorkoutExercises.map((row) => row.id);
  const ownSets = workoutExerciseIds.length
    ? await db
        .select()
        .from(workoutSets)
        .where(inArray(workoutSets.workoutExerciseId, workoutExerciseIds))
    : [];

  const ownRoutines = await db.select().from(routines).where(eq(routines.userId, userId));
  const routineIds = ownRoutines.map((routine) => routine.id);
  const ownRoutineExercises = routineIds.length
    ? await db.select().from(routineExercises).where(inArray(routineExercises.routineId, routineIds))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    account,
    customExercises: await db.select().from(exercises).where(eq(exercises.userId, userId)),
    routines: ownRoutines,
    routineExercises: ownRoutineExercises,
    workouts: ownWorkouts,
    workoutExercises: ownWorkoutExercises,
    workoutSets: ownSets,
    personalRecords: await db
      .select()
      .from(personalRecords)
      .where(eq(personalRecords.userId, userId)),
    bodyMeasurements: await db
      .select()
      .from(bodyMeasurements)
      .where(eq(bodyMeasurements.userId, userId)),
    // FR-NUT-14. Raw rows rather than the API shape: an export is the data the
    // user gave us, and each entry already carries its own nutrition snapshot.
    foodEntries: await db.select().from(foodEntries).where(eq(foodEntries.userId, userId)),
    customFoods: await db.select().from(foods).where(eq(foods.userId, userId)),
  };
}
