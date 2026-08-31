/**
 * Enumerations shared by the database, the API and the client. These mirror
 * the Postgres enums in BRD §9.2 exactly; adding a value means a migration.
 */
import { z } from 'zod';

export const unitSystemSchema = z.enum(['metric', 'imperial']);
export const experienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const muscleRoleSchema = z.enum(['primary', 'secondary']);
export const setTypeSchema = z.enum(['normal', 'warmup', 'failure', 'drop']);
export const workoutStatusSchema = z.enum(['in_progress', 'completed', 'discarded']);
export const prTypeSchema = z.enum(['heaviest_weight', 'best_1rm', 'best_set_volume']);
export const insightTypeSchema = z.enum(['plateau', 'progression', 'imbalance', 'summary']);
export const analysisStatusSchema = z.enum(['queued', 'processing', 'complete', 'failed']);
export const mediaKindSchema = z.enum(['image', 'gif', 'video']);
export const mediaDeliverySchema = z.enum(['r2_copy', 'external_embed']);
export const mediaStateSchema = z.enum(['pending_review', 'active', 'broken', 'removed']);

/** FR-MED-03: the licence allowlist. `unknown` exists but can never render. */
export const licenceStatusSchema = z.enum([
  'public_domain',
  'cc0',
  'cc_by',
  'cc_by_sa',
  'licensed_commercial',
  'original_work',
  'unknown',
]);

/** The licences an asset may hold and still be rendered. */
export const RENDERABLE_LICENCES = [
  'public_domain',
  'cc0',
  'cc_by',
  'cc_by_sa',
  'licensed_commercial',
  'original_work',
] as const satisfies readonly LicenceStatus[];

export const progressMetricSchema = z.enum([
  'best_set_weight',
  'estimated_1rm',
  'total_volume',
  'total_reps',
]);

export type UnitSystem = z.infer<typeof unitSystemSchema>;
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;
export type MuscleRole = z.infer<typeof muscleRoleSchema>;
export type SetType = z.infer<typeof setTypeSchema>;
export type WorkoutStatus = z.infer<typeof workoutStatusSchema>;
export type PrType = z.infer<typeof prTypeSchema>;
export type InsightType = z.infer<typeof insightTypeSchema>;
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
export type MediaKind = z.infer<typeof mediaKindSchema>;
export type MediaDelivery = z.infer<typeof mediaDeliverySchema>;
export type MediaState = z.infer<typeof mediaStateSchema>;
export type LicenceStatus = z.infer<typeof licenceStatusSchema>;
export type ProgressMetric = z.infer<typeof progressMetricSchema>;
