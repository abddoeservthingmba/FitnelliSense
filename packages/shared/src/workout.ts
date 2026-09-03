/** Workout contracts — FR-WK-01..12. */
import { z } from 'zod';
import { exerciseKindSchema, prTypeSchema, setTypeSchema, workoutStatusSchema } from './enums';
import { hunterRewardSchema } from './hunter';
import {
  decimalStringSchema,
  isoDateTimeSchema,
  noteTextSchema,
  distanceMetresSchema,
  durationSecsSchema,
  paginationSchema,
  positionSchema,
  positiveDecimalStringSchema,
  repsSchema,
  restSecsSchema,
  rpeSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives';

export const workoutSetSchema = z.object({
  id: uuidSchema,
  position: positionSchema,
  setType: setTypeSchema,
  weightKg: positiveDecimalStringSchema.nullable(),
  reps: repsSchema.nullable(),
  rpe: rpeSchema.nullable(),
  durationSecs: durationSecsSchema.nullable(),
  distanceM: distanceMetresSchema.nullable(),
  isCompleted: z.boolean(),
  completedAt: isoDateTimeSchema.nullable(),
  notes: noteTextSchema.nullable(),
});

export const workoutExerciseSchema = z.object({
  id: uuidSchema,
  exerciseId: uuidSchema,
  exerciseName: shortTextSchema,
  /** FR-CAR-03: the client cannot know which fields to show without this. */
  kind: exerciseKindSchema,
  position: positionSchema,
  restSecs: restSecsSchema.nullable(),
  notes: noteTextSchema.nullable(),
  sets: z.array(workoutSetSchema),
});

export const workoutSummarySchema = z.object({
  id: uuidSchema,
  routineId: uuidSchema.nullable(),
  name: shortTextSchema.nullable(),
  status: workoutStatusSchema,
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  durationSecs: z.number().int().nullable(),
  totalVolumeKg: positiveDecimalStringSchema.nullable(),
  setCount: z.number().int(),
  exerciseNames: z.array(shortTextSchema),
});

export const workoutDetailSchema = workoutSummarySchema.extend({
  notes: noteTextSchema.nullable(),
  exercises: z.array(workoutExerciseSchema),
});

/**
 * FR-WK-01 / NFR-R-04: the client supplies `id` and `startedAt` because the
 * workout may well begin with no network at all.
 */
export const startWorkoutRequestSchema = z.object({
  id: uuidSchema,
  routineId: uuidSchema.nullish(),
  name: shortTextSchema.nullish(),
  startedAt: isoDateTimeSchema,
});

export const updateWorkoutRequestSchema = z
  .object({
    name: shortTextSchema.nullish(),
    notes: noteTextSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const addWorkoutExerciseRequestSchema = z.object({
  id: uuidSchema,
  exerciseId: uuidSchema,
  restSecs: restSecsSchema.nullish(),
});

export const reorderRequestSchema = z.object({
  /** The complete set of ids in their new order — a partial list is rejected. */
  orderedIds: z.array(uuidSchema).min(1).max(60),
});

export const addSetRequestSchema = z.object({
  id: uuidSchema,
  setType: setTypeSchema.default('normal'),
  weightKg: positiveDecimalStringSchema.nullish(),
  reps: repsSchema.nullish(),
  rpe: rpeSchema.nullish(),
  /**
   * Cardio (FR-CAR-02). Both optional and independent: people log "20 minutes
   * on the bike" with no distance, and "5 km" with no stopwatch.
   *
   * Whole seconds and whole metres. Neither needs a decimal — nobody logs a
   * fraction of a second on a treadmill, and a metre is fine enough for a run.
   */
  durationSecs: durationSecsSchema.nullish(),
  distanceM: distanceMetresSchema.nullish(),
  isCompleted: z.boolean().default(false),
  completedAt: isoDateTimeSchema.nullish(),
  notes: noteTextSchema.nullish(),
});

export const updateSetRequestSchema = z
  .object({
    setType: setTypeSchema.optional(),
    weightKg: positiveDecimalStringSchema.nullish(),
    reps: repsSchema.nullish(),
    rpe: rpeSchema.nullish(),
    durationSecs: durationSecsSchema.nullish(),
    distanceM: distanceMetresSchema.nullish(),
    isCompleted: z.boolean().optional(),
    completedAt: isoDateTimeSchema.nullish(),
    notes: noteTextSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const completeWorkoutRequestSchema = z.object({
  completedAt: isoDateTimeSchema,
});

export const personalRecordHitSchema = z.object({
  exerciseId: uuidSchema,
  exerciseName: shortTextSchema,
  prType: prTypeSchema,
  value: positiveDecimalStringSchema,
  weightKg: positiveDecimalStringSchema.nullable(),
  reps: repsSchema.nullable(),
  previousValue: positiveDecimalStringSchema.nullable(),
});

/**
 * One exercise, this session against the last time it was trained in the
 * session being compared against.
 *
 * `deltaWeightKg` is signed — it is a change, and a lighter top set is a real
 * outcome that has to be representable.
 */
export const exerciseComparisonSchema = z.object({
  exerciseId: uuidSchema,
  exerciseName: shortTextSchema,
  weightKg: positiveDecimalStringSchema,
  reps: repsSchema,
  previousWeightKg: positiveDecimalStringSchema.nullable(),
  previousReps: repsSchema.nullable(),
  deltaWeightKg: decimalStringSchema.nullable(),
  moreRepsAtSameWeight: z.boolean(),
});

export const sessionComparisonSchema = z.object({
  volumeKg: positiveDecimalStringSchema,
  previousVolumeKg: positiveDecimalStringSchema,
  deltaVolumeKg: decimalStringSchema,
  volumeChangePercent: z.number().nullable(),
  sets: z.number().int(),
  previousSets: z.number().int(),
  reps: z.number().int(),
  previousReps: z.number().int(),
  durationSecs: z.number().int(),
  previousDurationSecs: z.number().int(),
  exercises: z.array(exerciseComparisonSchema),
  hasPrevious: z.boolean(),
  /** One line, phrased from the numbers above and never from a model. */
  headline: z.string().nullable(),
  /**
   * What it was compared against. The previous run of the same routine where
   * there is one — measuring a leg day against the push day before it produces
   * a number that is correct and meaningless.
   */
  basis: z.enum(['same_routine', 'previous_workout', 'none']),
});

export const completeWorkoutResponseSchema = z.object({
  workout: workoutSummarySchema,
  personalRecords: z.array(personalRecordHitSchema),
  /** FR-WK-10: a session that set no record still did something. */
  comparison: sessionComparisonSchema,
  /**
   * What the session did to the Hunter System. Returned here rather than
   * fetched afterwards, so the summary and the level-up are one moment instead
   * of a surprise on the next screen.
   */
  hunter: hunterRewardSchema,
});

/**
 * FR-WK-06: the server's answer to "what should this set start at". Resolved
 * server-side too, so a freshly installed device suggests the same values as
 * one that already has local history.
 */
export const prefillQuerySchema = z.object({
  exerciseId: uuidSchema,
  workoutId: uuidSchema.optional(),
  routineId: uuidSchema.optional(),
});

export const prefillSchema = z.object({
  weightKg: positiveDecimalStringSchema.nullable(),
  reps: repsSchema.nullable(),
  /** Shown as a quiet hint, so a prefilled number is never unexplained. */
  origin: z.enum(['previous_set', 'last_session', 'routine_target', 'empty']),
});

export const listWorkoutsQuerySchema = paginationSchema.extend({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutSummary = z.infer<typeof workoutSummarySchema>;
export type WorkoutDetail = z.infer<typeof workoutDetailSchema>;
export type StartWorkoutRequest = z.infer<typeof startWorkoutRequestSchema>;
export type AddSetRequest = z.infer<typeof addSetRequestSchema>;
export type UpdateSetRequest = z.infer<typeof updateSetRequestSchema>;
export type PersonalRecordHit = z.infer<typeof personalRecordHitSchema>;
export type Prefill = z.infer<typeof prefillSchema>;
export type PrefillQuery = z.infer<typeof prefillQuerySchema>;
export type CompleteWorkoutResponse = z.infer<typeof completeWorkoutResponseSchema>;
export type ExerciseComparison = z.infer<typeof exerciseComparisonSchema>;
export type SessionComparison = z.infer<typeof sessionComparisonSchema>;
