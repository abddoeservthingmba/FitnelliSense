/**
 * Form analysis contracts — FR-VID-*.
 *
 * The shape of the flow, because it is the part worth agreeing on before any
 * of it is built:
 *
 *   1. The client records a set at 720p30 and asks for somewhere to put it.
 *   2. The server creates an analysis row — that row's id IS the reference id
 *      — and hands back a presigned PUT valid for minutes.
 *   3. The client uploads straight to R2. The video never passes through the
 *      API, which on a free instance could not carry it anyway.
 *   4. The client marks the upload complete; the analysis becomes `queued`.
 *   5. A worker tracks the bar and writes the result. Until then the row says
 *      `queued` or `processing`, and the client shows that rather than guessing.
 *
 * The reference id is issued BEFORE the upload on purpose. If it were issued
 * after, a client that uploaded and then crashed would leave an object in the
 * bucket that nothing in the database knows about — and nothing would ever
 * delete it.
 */
import { z } from 'zod';
import { analysisStatusSchema } from './enums';
import { isoDateTimeSchema, uuidSchema } from './primitives';

/*
 * The status enum lives in ./enums with every other one — declaring a second
 * copy here is exactly the drift this package exists to prevent, and it is
 * what the duplicate-export error caught.
 */

/**
 * What the client asks for before it uploads.
 *
 * `contentLength` is required, not optional: it is what lets the server refuse
 * an oversized file at presign time rather than discovering it after 60 MB has
 * already crossed someone's mobile data.
 */
export const requestVideoUploadSchema = z.object({
  /** Bytes. Capped server-side; a 30-second 720p clip is around 6 MB. */
  contentLength: z
    .number()
    .int()
    .min(1_024, 'That file is too small to be a video')
    .max(80 * 1024 * 1024, 'Videos must be under 80 MB — record at 720p and keep it short'),
  /**
   * Only MP4. One container means one thing for the worker to decode, and
   * every phone can produce it.
   */
  contentType: z.literal('video/mp4'),
  /**
   * Seconds — the length of the FILE, which may be longer than the span that
   * gets analysed. An hour is a nonsense ceiling rather than a real policy;
   * the byte cap above is what actually bounds this, since no phone produces
   * an hour of video under 80 MB.
   */
  durationSecs: z.number().int().min(1).max(3600),
  /**
   * Where the analysed window starts, for a video longer than the ceiling in
   * `@fi/domain`'s `MAX_CLIP_SECONDS`.
   *
   * Only the START is sent. The window is always exactly as long as the
   * ceiling allows, so an end would be a second number the client could
   * disagree with the server about — the server derives it with `clipWindow`,
   * which is also the only place the ceiling is written down.
   *
   * Omitted means from the beginning, which is what every clip short enough to
   * need no choice sends.
   */
  clipStartSecs: z.number().int().min(0).optional(),
});

export const videoUploadTargetSchema = z.object({
  /** The reference id. Everything afterwards is addressed by this. */
  analysisId: uuidSchema,
  uploadUrl: z.url(),
  /** The exact headers the PUT must carry, and no others. */
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: isoDateTimeSchema,
});

/** One rep, as measured. Mirrors `Rep` in @fi/domain. */
export const repMetricsSchema = z.object({
  index: z.number().int(),
  romM: z.number(),
  concentricMs: z.number().int(),
  eccentricMs: z.number().int(),
  meanConcentricVelocityMs: z.number(),
  peakConcentricVelocityMs: z.number(),
});

export const analysisResultSchema = z.object({
  reps: z.array(repMetricsSchema),
  /** Range of motion across the whole clip, in metres. */
  verticalRangeM: z.number(),
  /** The furthest the bar strayed from where it started. */
  maxHorizontalDriftM: z.number(),
  /** 0 to 1. 1 is a perfectly vertical bar. */
  straightness: z.number(),
  /** Null when there is nothing to compare — one rep, or no upward movement. */
  velocityLossPercent: z.number().nullable(),
  /**
   * How pixels became metres. Recorded because every number above depends on
   * it, and a wrong plate measurement makes them all wrong together — which
   * is invisible unless the scale is on the record.
   */
  pixelsPerMetre: z.number(),
});

export const analysisSchema = z.object({
  id: uuidSchema,
  workoutSetId: uuidSchema.nullable(),
  status: analysisStatusSchema,
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  repCount: z.number().int().nullable(),
  /**
   * The span of the video that was analysed. Equal to the whole file for a
   * clip short enough not to need a choice, and worth showing when it is not —
   * otherwise "4 reps" from a ten-minute video is unexplainable.
   */
  clipStartSecs: z.number().int(),
  clipEndSecs: z.number().int(),
  result: analysisResultSchema.nullable(),
  /**
   * Why it failed, in words a user can act on. Never a stack trace — a worker
   * error message is for us and belongs in the logs.
   */
  error: z.string().nullable(),
  /**
   * A presigned playback URL, short-lived. Null when the upload has not
   * happened, or when storage is unavailable — the client shows the numbers
   * without the video rather than an error (NFR-B-06).
   */
  videoUrl: z.url().nullable(),
});

export const analysisListSchema = z.object({ items: z.array(analysisSchema) });

export type RequestVideoUpload = z.infer<typeof requestVideoUploadSchema>;
export type VideoUploadTarget = z.infer<typeof videoUploadTargetSchema>;
export type RepMetrics = z.infer<typeof repMetricsSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
