/**
 * The single error envelope (BRD §10.2). The client switches on `code`, never
 * on a message string, so copy can change without breaking behaviour.
 */
import { z } from 'zod';

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  /** NFR-B-08: the database is unreachable; the client treats this as offline. */
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const errorCodeSchema = z.enum(
  Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]],
) as z.ZodType<ErrorCode>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .default([]),
    requestId: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}

/** Codes worth retrying rather than surfacing as a failure (NFR-R-05). */
export const RETRYABLE_ERROR_CODES: readonly ErrorCode[] = [
  'RATE_LIMITED',
  'INTERNAL',
  'SERVICE_UNAVAILABLE',
];

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.includes(code);
}
