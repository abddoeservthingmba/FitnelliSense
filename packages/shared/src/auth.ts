/** Auth contracts — FR-AUTH-01..06. */
import { z } from 'zod';
import { isoDateTimeSchema, shortTextSchema, uuidSchema } from './primitives.js';

export const emailSchema = z.email().max(254).toLowerCase().trim();

/**
 * FR-AUTH-02: length is the only rule that reliably helps. A 12-character
 * floor with no composition theatre, so users pick passphrases rather than
 * `Passw0rd!`.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'That is longer than we can hash safely');

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: shortTextSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(500),
});

export const logoutRequestSchema = refreshRequestSchema;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  /** Opaque and single-use: presenting it rotates it (FR-AUTH-04). */
  refreshToken: z.string(),
  accessTokenExpiresAt: isoDateTimeSchema,
  refreshTokenExpiresAt: isoDateTimeSchema,
});

export const authResponseSchema = z.object({
  userId: uuidSchema,
  tokens: tokenPairSchema,
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(500),
  password: passwordSchema,
});

/** The claims the API signs. Deliberately minimal — no email, no name. */
export const accessTokenClaimsSchema = z.object({
  sub: uuidSchema,
  isAdmin: z.boolean(),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
