/** Routine contracts — FR-RT-01..05. */
import { z } from 'zod';
import {
  isoDateTimeSchema,
  noteTextSchema,
  positionSchema,
  positiveDecimalStringSchema,
  repsSchema,
  restSecsSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives';

export const routineExerciseSchema = z.object({
  id: uuidSchema,
  exerciseId: uuidSchema,
  exerciseName: shortTextSchema,
  position: positionSchema,
  targetSets: z.number().int().min(1).max(50).nullable(),
  targetRepsMin: repsSchema.nullable(),
  targetRepsMax: repsSchema.nullable(),
  targetWeightKg: positiveDecimalStringSchema.nullable(),
  restSecs: restSecsSchema.nullable(),
  notes: noteTextSchema.nullable(),
});

export const routineSummarySchema = z.object({
  id: uuidSchema,
  name: shortTextSchema,
  notes: noteTextSchema.nullable(),
  exerciseCount: z.number().int(),
  /** Denormalised for the list row, so the routines tab needs no joins. */
  exerciseNames: z.array(shortTextSchema),
  archivedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export const routineDetailSchema = routineSummarySchema.extend({
  exercises: z.array(routineExerciseSchema),
});

const routineExerciseInputSchema = z
  .object({
    id: uuidSchema.optional(),
    exerciseId: uuidSchema,
    targetSets: z.number().int().min(1).max(50).nullish(),
    targetRepsMin: repsSchema.nullish(),
    targetRepsMax: repsSchema.nullish(),
    targetWeightKg: positiveDecimalStringSchema.nullish(),
    restSecs: restSecsSchema.nullish(),
    notes: noteTextSchema.nullish(),
  })
  .refine(
    (value) =>
      value.targetRepsMin == null ||
      value.targetRepsMax == null ||
      value.targetRepsMin <= value.targetRepsMax,
    { message: 'The rep range is inverted', path: ['targetRepsMax'] },
  );

/**
 * Position is the array index, never a client-supplied number: reordering is
 * "send the list in the order you want", which is impossible to get wrong.
 */
export const saveRoutineRequestSchema = z.object({
  id: uuidSchema.optional(),
  name: shortTextSchema,
  notes: noteTextSchema.nullish(),
  exercises: z.array(routineExerciseInputSchema).min(1).max(60),
});

export type RoutineExercise = z.infer<typeof routineExerciseSchema>;
export type RoutineSummary = z.infer<typeof routineSummarySchema>;
export type RoutineDetail = z.infer<typeof routineDetailSchema>;
export type SaveRoutineRequest = z.infer<typeof saveRoutineRequestSchema>;
export type RoutineExerciseInput = z.infer<typeof routineExerciseInputSchema>;
