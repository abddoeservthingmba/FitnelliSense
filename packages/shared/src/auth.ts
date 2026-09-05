/** Auth contracts — FR-AUTH-01..06. */
import { z } from 'zod';
import { isoDateTimeSchema, shortTextSchema, uuidSchema } from './primitives';

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

/**
 * Signing in with Google.
 *
 * Only the ID token crosses the wire. No email, no name, no id — the client
 * could claim any of them, and the server reads all three out of the token it
 * has cryptographically verified instead.
 */
export const googleSignInSchema = z.object({
  idToken: z.string().min(20).max(4000),
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

/**
 * Six digits, spaces and dashes tolerated.
 *
 * People paste codes out of an email and the paste brings the formatting with
 * it. Stripping it here rather than rejecting the input means a valid code is
 * never refused for how it was copied.
 */
export const otpCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'));

/**
 * Reset takes the email as well as the code, and not for convenience: the code
 * is only six digits, so it must be looked up within one account rather than
 * across all of them.
 */
export const passwordResetConfirmSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  password: passwordSchema,
});

/** Asking for a verification code needs no body — the caller is authenticated. */
export const verifyEmailConfirmSchema = z.object({ code: otpCodeSchema });

/** What a code request reports back, so the UI can say what happened. */
export const codeRequestResponseSchema = z.object({
  ok: z.literal(true),
  /**
   * False when no email provider is configured. The UI needs to distinguish
   * "check your inbox" from "this cannot be delivered yet"; it says nothing
   * about whether the address exists.
   */
  deliveryConfigured: z.boolean(),
  /** How long the code lasts, so the screen need not hardcode it. */
  expiresInSeconds: z.number().int(),
});

export const verificationStatusSchema = z.object({
  email: emailSchema,
  emailVerified: z.boolean(),
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
export type GoogleSignIn = z.infer<typeof googleSignInSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
export type VerifyEmailConfirm = z.infer<typeof verifyEmailConfirmSchema>;
export type CodeRequestResponse = z.infer<typeof codeRequestResponseSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
