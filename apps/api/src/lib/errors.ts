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

/**
 * Finds the driver's own error inside whatever wrapped it.
 *
 * Drizzle raises a `DrizzleQueryError` and hangs the real `PostgresError` off
 * `cause`, so reading `error.code` at the top level silently sees nothing —
 * which quietly turned every mapping below into a no-op until a live database
 * proved otherwise.
 */
function driverError(error: unknown): { code?: unknown; constraint_name?: unknown } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return null;
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') return candidate;
    current = candidate.cause;
  }
  return null;
}

function pgCode(error: unknown): string | null {
  const code = driverError(error)?.code;
  return typeof code === 'string' ? code : null;
}

/** The constraint a failed write violated, for callers that recognise one. */
export function constraintName(error: unknown): string | null {
  const name = driverError(error)?.constraint_name;
  return typeof name === 'string' ? name : null;
}

export function isConnectionError(error: unknown): boolean {
  const code = pgCode(error);
  return code !== null && PG_CONNECTION_CODES.has(code);
}

/**
 * Whether this came from the database driver at all. Postgres error codes are
 * five characters (`23505`); the driver also raises its own socket-level codes,
 * which the connection set above covers.
 */
export function isDatabaseError(error: unknown): boolean {
  const code = pgCode(error);
  if (code === null) return false;
  return /^[0-9A-Z]{5}$/.test(code) || PG_CONNECTION_CODES.has(code);
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

  const constraint = constraintName(error);
  const mapped = constraint === null ? undefined : constraintMessages[constraint];
  if (mapped) return mapped;

  switch (code) {
    case PG_UNIQUE_VIOLATION:
      return conflict('That already exists');
    case PG_FOREIGN_KEY_VIOLATION:
      return badRequest('That references something which does not exist');
    case PG_CHECK_VIOLATION:
      return badRequest('That value is not allowed');
    default:
      // Everything else — including `28P01`, a rejected database password — is
      // a 500 on purpose. NFR-B-08's 503 means "try again shortly", and bad
      // credentials will not fix themselves; saying otherwise sends the client
      // into a retry loop and hides a configuration error.
      return new AppError('INTERNAL', 'Something went wrong', { cause: error });
  }
}
