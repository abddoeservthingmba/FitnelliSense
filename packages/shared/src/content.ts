/**
 * The seed catalogue file format — FR-ADM-07, R11.
 *
 * `content/exercises.seed.json` is the reviewable source of truth for the
 * system catalogue. It round-trips: export writes this shape, import reads it
 * idempotently, and a schema failure stops the seed rather than shipping an
 * exercise with unverifiable media (BRD §16.2 task 3).
 */
import { z } from 'zod';
import { licenceStatusSchema, mediaDeliverySchema, mediaKindSchema } from './enums.js';
import { noteTextSchema, shortTextSchema, slugSchema } from './primitives.js';

export const seedMediaSchema = z.object({
  kind: mediaKindSchema,
  delivery: mediaDeliverySchema,
  r2Key: z.string().min(1).max(500).nullish(),
  externalUrl: z.url().max(2000).nullish(),
  sourceUrl: z.string().min(1).max(2000),
  sourceName: shortTextSchema,
  /** FR-MED-10: the seed may not carry `unknown`. */
  licence: licenceStatusSchema.exclude(['unknown']),
  licenceUrl: z.url().max(2000).nullish(),
  attributionText: noteTextSchema.nullish(),
  requiresAttribution: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
});

export const seedExerciseSchema = z.object({
  slug: slugSchema,
  name: shortTextSchema,
  description: noteTextSchema.nullish(),
  instructions: noteTextSchema.nullish(),
  equipment: slugSchema.nullish(),
  isUnilateral: z.boolean().default(false),
  primaryMuscles: z.array(slugSchema).min(1),
  secondaryMuscles: z.array(slugSchema).default([]),
  movementPattern: slugSchema.nullish(),
  media: z.array(seedMediaSchema).default([]),
});

export const seedTaxonomySchema = z.object({
  muscleGroups: z.array(z.object({ slug: slugSchema, name: shortTextSchema })),
  muscles: z.array(
    z.object({ slug: slugSchema, name: shortTextSchema, muscleGroup: slugSchema }),
  ),
  equipment: z.array(z.object({ slug: slugSchema, name: shortTextSchema })),
});

export const seedCatalogueSchema = z.object({
  /** Bumped whenever the file's shape changes, so import can refuse old files. */
  version: z.literal(1),
  taxonomy: seedTaxonomySchema,
  exercises: z.array(seedExerciseSchema),
});

export type SeedMedia = z.infer<typeof seedMediaSchema>;
export type SeedExercise = z.infer<typeof seedExerciseSchema>;
export type SeedTaxonomy = z.infer<typeof seedTaxonomySchema>;
export type SeedCatalogue = z.infer<typeof seedCatalogueSchema>;
