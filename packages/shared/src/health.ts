/** Health contracts — NFR-O-01, NFR-O-02, NFR-D-05. */
import { z } from 'zod';
import { isoDateTimeSchema } from './primitives.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  /** NFR-D-05: the running commit must always be recoverable from here. */
  commit: z.string(),
  environment: z.string(),
  uptimeSecs: z.number(),
  time: isoDateTimeSchema,
});

export const dependencyCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['ok', 'degraded', 'down']),
  latencyMs: z.number().nullable(),
  detail: z.string().nullable(),
});

export const deepHealthResponseSchema = healthResponseSchema.extend({
  status: z.enum(['ok', 'degraded', 'down']),
  dependencies: z.array(dependencyCheckSchema),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type DeepHealthResponse = z.infer<typeof deepHealthResponseSchema>;
export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;
