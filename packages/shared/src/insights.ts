/**
 * Training insights contracts — FR-AI-04, FR-AI-09.
 *
 * Every figure here is computed by `packages/domain` from logged data. There is
 * no model involved: FR-AI-09 says a model may phrase these numbers but never
 * calculates one, and nothing in this payload requires phrasing to be useful.
 *
 * The shape is a **comparison**: the current window against the one
 * immediately before it, of equal length. "6,000 kg of chest work" means
 * little on its own; "6,000 kg, up 20% on the previous four weeks" is the
 * thing a training log exists to tell you.
 */
import { z } from 'zod';
import { isoDateSchema, positiveDecimalStringSchema, shortTextSchema } from './primitives';

/**
 * How far back to compare. Each window is compared against one of equal
 * length immediately before it, so "30d" means this month against last.
 */
export const insightsWindowSchema = z.enum(['14d', '30d', '90d']);

export const insightsQuerySchema = z.object({
  window: insightsWindowSchema.default('30d'),
  /** The client's local date. A window boundary is a local calendar fact. */
  today: isoDateSchema.optional(),
});

/** What one muscle group did, and how that compares with before. */
export const muscleChangeSchema = z.object({
  group: shortTextSchema,
  volumeKg: positiveDecimalStringSchema,
  previousVolumeKg: positiveDecimalStringSchema,
  /** Signed: negative when the group was trained less than before. */
  deltaVolumeKg: z.string(),
  /**
   * Null when there is nothing meaningful to compare against — a group trained
   * for the first time, or from a base so small the percentage would be
   * theatre. The absolute change is always present.
   */
  changePercent: z.number().nullable(),
  /** Share of this window's total volume, for the bar chart. */
  sharePercent: z.number(),
  sets: z.number().int(),
  previousSets: z.number().int(),
  workouts: z.number().int(),
  previousWorkouts: z.number().int(),
});

/** A computed observation. `facts` is what the UI renders; never prose alone. */
export const insightSchema = z.object({
  type: z.enum(['plateau', 'progression', 'imbalance', 'summary']),
  title: shortTextSchema,
  facts: z.record(z.string(), z.union([z.number(), z.string()])),
  /** What makes the claim supportable — sessions counted, weeks spanned. */
  basis: z.string().max(200),
});

export const trainingInsightsSchema = z.object({
  window: insightsWindowSchema,
  /** Inclusive dates of the window being reported. */
  from: isoDateSchema,
  to: isoDateSchema,
  /** The equal-length window it is compared against. */
  previousFrom: isoDateSchema,
  previousTo: isoDateSchema,

  /** Heaviest first. Includes groups trained only in the previous window. */
  muscles: z.array(muscleChangeSchema),

  totals: z.object({
    volumeKg: positiveDecimalStringSchema,
    previousVolumeKg: positiveDecimalStringSchema,
    sets: z.number().int(),
    previousSets: z.number().int(),
    workouts: z.number().int(),
    previousWorkouts: z.number().int(),
  }),

  /** Plateau, progression, imbalance and adherence, where the data supports them. */
  insights: z.array(insightSchema),

  /**
   * False when there is too little history for a comparison to mean anything.
   * The client says so rather than drawing an empty chart.
   */
  hasEnoughData: z.boolean(),
});

export type InsightsWindow = z.infer<typeof insightsWindowSchema>;
export type InsightsQuery = z.infer<typeof insightsQuerySchema>;
export type MuscleChange = z.infer<typeof muscleChangeSchema>;
export type TrainingInsight = z.infer<typeof insightSchema>;
export type TrainingInsights = z.infer<typeof trainingInsightsSchema>;
