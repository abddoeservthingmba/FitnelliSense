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
export const prTypeSchema = z.enum([
  'heaviest_weight',
  'best_1rm',
  'best_set_volume',
  // Cardio (FR-CAR-06). 'best_pace' is the only record in the system where a
  // LOWER number wins, which every comparison against it has to allow for.
  'farthest_distance',
  'longest_duration',
  'best_pace',
]);
export const insightTypeSchema = z.enum(['plateau', 'progression', 'imbalance', 'summary']);
/**
 * Form-analysis lifecycle. `awaiting_upload` is the state between the row
 * being created — which is what issues the reference id — and the video
 * actually arriving in the bucket (0013).
 */
export const analysisStatusSchema = z.enum([
  'awaiting_upload',
  'queued',
  'processing',
  'complete',
  'failed',
  // The video is kept but nothing will measure it — either the lift has no
  // rules, or the user chose to film without analysis. A terminal state, not a
  // queue: 'queued' would leave the screen waiting for a worker that is never
  // coming for this row.
  'stored_only',
]);
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

/**
 * What kind of work an exercise is, and therefore which numbers it takes.
 *
 * A treadmill set has no weight and no reps; a bench press has no distance.
 * Without this the client cannot know which inputs to show, and the domain
 * cannot know which arithmetic applies (FR-CAR-01).
 */
export const exerciseKindSchema = z.enum(['strength', 'cardio']);
export type ExerciseKind = z.infer<typeof exerciseKindSchema>;

export const CARDIO_PR_TYPES = ['farthest_distance', 'longest_duration', 'best_pace'] as const;
