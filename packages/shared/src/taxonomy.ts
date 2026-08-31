/** Taxonomy contracts — FR-EX-03, FR-EX-06. Two levels: group -> muscle. */
import { z } from 'zod';
import { shortTextSchema, slugSchema } from './primitives.js';

export const muscleGroupSchema = z.object({
  id: z.number().int(),
  slug: slugSchema,
  name: shortTextSchema,
});

export const muscleSchema = z.object({
  id: z.number().int(),
  muscleGroupId: z.number().int(),
  slug: slugSchema,
  name: shortTextSchema,
});

export const equipmentSchema = z.object({
  id: z.number().int(),
  slug: slugSchema,
  name: shortTextSchema,
});

/** One cacheable payload — the client fetches this once per session. */
export const taxonomyResponseSchema = z.object({
  muscleGroups: z.array(muscleGroupSchema),
  muscles: z.array(muscleSchema),
  equipment: z.array(equipmentSchema),
});

export type MuscleGroup = z.infer<typeof muscleGroupSchema>;
export type Muscle = z.infer<typeof muscleSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type TaxonomyResponse = z.infer<typeof taxonomyResponseSchema>;
