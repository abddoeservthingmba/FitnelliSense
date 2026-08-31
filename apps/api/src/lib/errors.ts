/**
 * The one way this API fails (BRD §10.2).
 *
 * Handlers throw an `AppError`; the error handler in `plugins/error-handler.ts`
 * turns it into the shared envelope. Nothing else formats an error response.
 */
import { httpStatusFor, type ErrorCode } from '@fi/shared';

export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];
  /** Set when a 429 or 503 should tell the client how long to wait. */
  readonly retryAfterSecs?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; retryAfterSecs?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options.details ?? [];
    if (options.retryAfterSecs !== undefined) this.retryAfterSecs = options.retryAfterSecs;
  }

  get statusCode(): number {
    return httpStatusFor(this.code);
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new AppError('VALIDATION_ERROR', message, details ? { details } : {});

export const unauthenticated = (message = 'Sign in to continue') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to that') =>
  new AppError('FORBIDDEN', message);

/**
 * Used for anything the caller does not own as well as anything that does not
 * exist — an ownership failure must not confirm that the row is real
 * (NFR-S-03), and the /admin namespace must not be enumerable (§10.2).
 */
export const notFound = (what = 'That could not be found') => new AppError('NOT_FOUND', what);

export const conflict = (message: string) => new AppError('CONFLICT', message);

export const rateLimited = (retryAfterSecs: number) =>
  new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.', { retryAfterSecs });

/** NFR-B-08: the database is unreachable; the client should treat this as offline. */
export const serviceUnavailable = (cause?: unknown) =>
  new AppError('SERVICE_UNAVAILABLE', 'The service is briefly unavailable. Retrying will work.', {
    retryAfterSecs: 5,
    cause,
  });

/** Postgres error codes we translate rather than leak as a 500. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_CONNECTION_CODES = new Set([
  '08000',
  '08003',
  '08006',
  '57P01',
  '57P03',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
]);

function pgCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function isConnectionError(error: unknown): boolean {
  const code = pgCode(error);
  return code !== null && PG_CONNECTION_CODES.has(code);
}

/**
 * Maps a database failure onto the error vocabulary. `constraintMessages` lets
 * a caller name the constraint it expects, so a unique-violation reads as
 * "you already have a workout in progress" rather than a generic conflict.
 */
export function fromDatabaseError(
  error: unknown,
  constraintMessages: Record<string, AppError> = {},
): AppError {
  const code = pgCode(error);
  if (code === null) return new AppError('INTERNAL', 'Something went wrong', { cause: error });
  if (PG_CONNECTION_CODES.has(code)) return serviceUnavailable(error);

  const constraint = (error as { constraint_name?: unknown }).constraint_name;
  const mapped = typeof constraint === 'string' ? constraintMessages[constraint] : undefined;
  if (mapped) return mapped;

  switch (code) {
    case PG_UNIQUE_VIOLATION:
      return conflict('That already exists');
    case PG_FOREIGN_KEY_VIOLATION:
      return badRequest('That references something which does not exist');
    case PG_CHECK_VIOLATION:
      return badRequest('That value is not allowed');
    default:
      return new AppError('INTERNAL', 'Something went wrong', { cause: error });
  }
}
