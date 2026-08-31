/** Profile contracts — FR-AUTH-07..09. */
import { z } from 'zod';
import { experienceLevelSchema, unitSystemSchema } from './enums';
import {
  isoDateSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  restSecsSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives';

export const profileSchema = z.object({
  displayName: shortTextSchema,
  units: unitSystemSchema,
  experience: experienceLevelSchema.nullable(),
  /** Canonical kilograms, like every other weight (FR-WK-12). */
  bodyweightKg: positiveDecimalStringSchema.nullable(),
  dateOfBirth: isoDateSchema.nullable(),
  defaultRestSecs: restSecsSchema,
  /** FR-AI-06 / FR-AI-07: off until the user opts in. */
  aiEnabled: z.boolean(),
});

export const meResponseSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  isAdmin: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: isoDateTimeSchema,
  profile: profileSchema,
  /**
   * NFR-S-12: the server presigns the avatar; the client never builds a media
   * URL itself. Null when no avatar is set or R2 is unavailable (NFR-B-06).
   */
  avatarUrl: z.url().nullable(),
});

/** PATCH /me — every field optional, and unknown fields are rejected (NFR-S-05). */
export const updateProfileRequestSchema = profileSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const avatarUploadUrlResponseSchema = z.object({
  uploadUrl: z.url(),
  /** The client PUTs to `uploadUrl`, then PATCHes /me with this key. */
  r2Key: z.string(),
  expiresAt: isoDateTimeSchema,
  /** The exact headers the client must send with the PUT, and no others. */
  requiredHeaders: z.record(z.string(), z.string()),
});

export type Profile = z.infer<typeof profileSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
