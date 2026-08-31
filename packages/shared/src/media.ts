/**
 * Media contracts — FR-MED-01..10.
 *
 * BRD §10.2: an API response never contains a media URL. It contains a
 * `mediaId`, and the client resolves it through `/media/:id/url`. That is why
 * there is no `url` field on `mediaRefSchema`.
 */
import { z } from 'zod';
import {
  licenceStatusSchema,
  mediaDeliverySchema,
  mediaKindSchema,
  mediaStateSchema,
} from './enums';
import { isoDateTimeSchema, noteTextSchema, shortTextSchema, uuidSchema } from './primitives';

/** What an exercise payload carries: an id and enough to lay out a placeholder. */
export const mediaRefSchema = z.object({
  mediaId: uuidSchema,
  kind: mediaKindSchema,
  isPrimary: z.boolean(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

/** FR-MED-04: attribution travels with the URL so it cannot be dropped. */
export const resolvedMediaSchema = z.object({
  mediaId: uuidSchema,
  kind: mediaKindSchema,
  url: z.url(),
  expiresAt: isoDateTimeSchema.nullable(),
  requiresAttribution: z.boolean(),
  attribution: z
    .object({
      text: shortTextSchema,
      sourceName: shortTextSchema,
      licence: licenceStatusSchema,
      licenceUrl: z.url().nullable(),
    })
    .nullable(),
});

/** Admin-only view: the full provenance record (FR-MED-02). */
export const mediaAssetSchema = z.object({
  id: uuidSchema,
  kind: mediaKindSchema,
  delivery: mediaDeliverySchema,
  state: mediaStateSchema,
  r2Key: z.string().nullable(),
  externalUrl: z.url().nullable(),
  sourceUrl: z.string(),
  sourceName: shortTextSchema,
  licence: licenceStatusSchema,
  licenceUrl: z.url().nullable(),
  attributionText: noteTextSchema.nullable(),
  requiresAttribution: z.boolean(),
  verifiedAt: isoDateTimeSchema.nullable(),
  verifiedBy: uuidSchema.nullable(),
  lastCheckedAt: isoDateTimeSchema.nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationSecs: z.number().int().nullable(),
});

/**
 * Registering an asset. The `delivery` discriminator decides which location
 * field is required — the same rule the `media_one_location` CHECK enforces in
 * Postgres, so a bad payload fails at the boundary rather than in the database.
 */
export const createMediaAssetRequestSchema = z
  .object({
    kind: mediaKindSchema,
    delivery: mediaDeliverySchema,
    r2Key: z.string().min(1).max(500).nullish(),
    externalUrl: z.url().max(2000).nullish(),
    sourceUrl: z.string().min(1).max(2000),
    sourceName: shortTextSchema,
    licence: licenceStatusSchema,
    licenceUrl: z.url().max(2000).nullish(),
    attributionText: noteTextSchema.nullish(),
    requiresAttribution: z.boolean().default(false),
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    durationSecs: z.number().int().positive().nullish(),
  })
  .check((ctx) => {
    const { delivery, r2Key, externalUrl, requiresAttribution, attributionText } = ctx.value;
    if (delivery === 'r2_copy' && (!r2Key || externalUrl)) {
      ctx.issues.push({
        code: 'custom',
        message: 'An r2_copy asset needs an r2Key and no externalUrl',
        path: ['r2Key'],
        input: ctx.value,
      });
    }
    if (delivery === 'external_embed' && (!externalUrl || r2Key)) {
      ctx.issues.push({
        code: 'custom',
        message: 'An external_embed asset needs an externalUrl and no r2Key',
        path: ['externalUrl'],
        input: ctx.value,
      });
    }
    if (requiresAttribution && !attributionText) {
      ctx.issues.push({
        code: 'custom',
        message: 'Attribution text is required for this licence (FR-MED-04)',
        path: ['attributionText'],
        input: ctx.value,
      });
    }
  });

export const updateMediaAssetRequestSchema = z.object({
  state: mediaStateSchema.optional(),
  licence: licenceStatusSchema.optional(),
  licenceUrl: z.url().max(2000).nullish(),
  attributionText: noteTextSchema.nullish(),
  requiresAttribution: z.boolean().optional(),
  sourceName: shortTextSchema.optional(),
  /** Setting this stamps the verifying admin and the time (FR-MED-09). */
  verify: z.boolean().optional(),
});

export type MediaRef = z.infer<typeof mediaRefSchema>;
export type ResolvedMedia = z.infer<typeof resolvedMediaSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type CreateMediaAssetRequest = z.infer<typeof createMediaAssetRequestSchema>;
export type UpdateMediaAssetRequest = z.infer<typeof updateMediaAssetRequestSchema>;
