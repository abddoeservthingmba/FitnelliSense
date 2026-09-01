/** Exercise contracts — FR-EX-01..10. */
import { z } from 'zod';
import { muscleRoleSchema } from './enums';
import { exerciseKindSchema } from './enums';
import { mediaRefSchema } from './media';
import {
  isoDateTimeSchema,
  noteTextSchema,
  paginationSchema,
  shortTextSchema,
  slugSchema,
  uuidSchema,
} from './primitives';

export const exerciseMuscleSchema = z.object({
  muscleId: z.number().int(),
  role: muscleRoleSchema,
});

/** The list-row shape: enough to render a search result and nothing more. */
export const exerciseSummarySchema = z.object({
  id: uuidSchema,
  name: shortTextSchema,
  slug: slugSchema.nullable(),
  equipmentId: z.number().int().nullable(),
  /** Which numbers this exercise takes: weight and reps, or time and distance. */
  kind: exerciseKindSchema,
  isUnilateral: z.boolean(),
  /** True for a user's own custom exercise, false for the seeded catalogue. */
  isCustom: z.boolean(),
  primaryMuscleIds: z.array(z.number().int()),
  primaryMediaId: uuidSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
});

export const exerciseDetailSchema = exerciseSummarySchema.extend({
  description: noteTextSchema.nullable(),
  instructions: noteTextSchema.nullable(),
  muscles: z.array(exerciseMuscleSchema),
  media: z.array(mediaRefSchema),
});

export const listExercisesQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  muscleGroupId: z.coerce.number().int().optional(),
  muscleId: z.coerce.number().int().optional(),
  equipmentId: z.coerce.number().int().optional(),
  /** Custom exercises only, catalogue only, or both (the default). */
  scope: z.enum(['all', 'custom', 'system']).default('all'),
  includeArchived: z.stringbool().default(false),
});

/**
 * FR-EX-04: at least one primary muscle. The rule lives here so the client
 * form and the API reject the same thing with the same message.
 */
const musclesSchema = z
  .array(exerciseMuscleSchema)
  .min(1)
  .max(20)
  .refine((muscles) => muscles.some((muscle) => muscle.role === 'primary'), {
    message: 'Pick at least one primary muscle',
  })
  .refine((muscles) => new Set(muscles.map((muscle) => muscle.muscleId)).size === muscles.length, {
    message: 'Each muscle may only be listed once',
  });

export const createExerciseRequestSchema = z.object({
  /** Client-generated so the exercise exists offline the moment it is saved. */
  id: uuidSchema.optional(),
  name: shortTextSchema,
  description: noteTextSchema.nullish(),
  instructions: noteTextSchema.nullish(),
  equipmentId: z.number().int().nullish(),
  kind: exerciseKindSchema.default('strength'),
  isUnilateral: z.boolean().default(false),
  muscles: musclesSchema,
});

export const updateExerciseRequestSchema = createExerciseRequestSchema
  .omit({ id: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export type ExerciseMuscle = z.infer<typeof exerciseMuscleSchema>;
export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>;
export type ExerciseDetail = z.infer<typeof exerciseDetailSchema>;
export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;
export type UpdateExerciseRequest = z.infer<typeof updateExerciseRequestSchema>;
