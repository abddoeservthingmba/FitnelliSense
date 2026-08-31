/** Progress contracts — FR-HP-04..07. */
import { z } from 'zod';
import { progressMetricSchema, prTypeSchema } from './enums.js';
import {
  isoDateSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  repsSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives.js';

export const progressPointSchema = z.object({
  date: isoDateSchema,
  value: positiveDecimalStringSchema,
});

export const progressSeriesQuerySchema = z.object({
  metric: progressMetricSchema.default('estimated_1rm'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const progressSeriesResponseSchema = z.object({
  exerciseId: uuidSchema,
  exerciseName: shortTextSchema,
  metric: progressMetricSchema,
  /** FR-HP-05: named so the chart can attribute the estimate. */
  formula: z.string().nullable(),
  points: z.array(progressPointSchema),
});

export const personalRecordSchema = z.object({
  id: uuidSchema,
  exerciseId: uuidSchema,
  exerciseName: shortTextSchema,
  prType: prTypeSchema,
  value: positiveDecimalStringSchema,
  weightKg: positiveDecimalStringSchema.nullable(),
  reps: repsSchema.nullable(),
  achievedAt: isoDateTimeSchema,
});

export const progressSummaryResponseSchema = z.object({
  workoutsThisWeek: z.number().int(),
  currentStreakDays: z.number().int(),
  volume7dKg: positiveDecimalStringSchema,
  volume30dKg: positiveDecimalStringSchema,
  lastWorkoutAt: isoDateTimeSchema.nullable(),
  recentRecords: z.array(personalRecordSchema),
});

export type ProgressPoint = z.infer<typeof progressPointSchema>;
export type ProgressSeriesResponse = z.infer<typeof progressSeriesResponseSchema>;
export type PersonalRecord = z.infer<typeof personalRecordSchema>;
export type ProgressSummaryResponse = z.infer<typeof progressSummaryResponseSchema>;
