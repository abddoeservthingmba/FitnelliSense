/**
 * The typed HTTP client. Every request in the app goes through here.
 *
 * Responsibilities, and deliberately no others:
 *   - attach the access token, and refresh it once on a 401 (FR-AUTH-03/04);
 *   - attach a correlation id, echoed back for support (NFR-O-04);
 *   - attach an idempotency key to mutations (NFR-R-03);
 *   - turn the error envelope into a typed `ApiRequestError`;
 *   - classify "offline" separately from "failed", because the UI treats them
 *     very differently (NFR-B-07, NFR-B-08).
 */
import { HEADERS, apiErrorSchema, type ErrorCode } from '@fi/shared';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ErrorCode | 'OFFLINE',
    message: string,
    readonly status: number,
    readonly details: { path: string; message: string }[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** The request never left the device — genuinely no connection (NFR-B-07). */
  get isOffline(): boolean {
    return this.code === 'OFFLINE';
  }

  /** The API answered, but its database is unreachable (NFR-B-08). */
  get isUnavailable(): boolean {
    return this.code === 'SERVICE_UNAVAILABLE';
  }

  /**
   * NFR-B-08 asks the client to *behave* the same for both — keep working
   * locally, retry, never surface a hard failure. It does not ask us to say
   * the same thing: "you're offline" is untrue when the connection is fine and
   * the server is the one struggling, and it sends the user to check their
   * wifi for no reason.
   */
  get isTransient(): boolean {
    return this.isOffline || this.isUnavailable;
  }

  /** The one place this distinction is turned into words. */
  get connectionMessage(): string {
    if (this.isOffline) return 'You appear to be offline.';
    if (this.isUnavailable) return 'The server is briefly unavailable.';
    return this.message;
  }

  get isAuthFailure(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }

  /** The first field-level message, for inline form errors. */
  fieldError(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path)?.message;
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

/**
 * Everything the client needs from the outside world. Injected rather than
 * imported so the auth layer owns the session and the client stays testable.
 */
export interface ClientHooks {
  getSession(): Session | null;
  /** Returns a refreshed session, or null when the user must sign in again. */
  refreshSession(): Promise<Session | null>;
  onAuthLost(): void;
}

let hooks: ClientHooks = {
  getSession: () => null,
  refreshSession: async () => null,
  onAuthLost: () => {},
};

export function configureClient(next: ClientHooks): void {
  hooks = next;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Set for mutations that must not run twice if replayed (NFR-R-03). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skips the bearer token: registration and sign-in. */
  anonymous?: boolean;
}

function newRequestId(): string {
  // Correlation only needs to be unique, not unguessable.
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function toError(response: Response): Promise<ApiRequestError> {
  let code: ErrorCode = 'INTERNAL';
  let message = 'Something went wrong';
  let details: { path: string; message: string }[] = [];

  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message;
      details = parsed.data.error.details ?? [];
    }
  } catch {
    // A non-JSON error body (a proxy page, say) keeps the defaults.
  }

  return new ApiRequestError(
    code,
    message,
    response.status,
    details,
    response.headers.get(HEADERS.requestId) ?? undefined,
  );
}

async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const abortIfCallerCancels = () => controller.abort();
  options.signal?.addEventListener('abort', abortIfCallerCancels);

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.idempotencyKey ? { [HEADERS.idempotencyKey]: options.idempotencyKey } : {}),
        [HEADERS.requestId]: newRequestId(),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortIfCallerCancels);
  }
}

/**
 * Performs a request, refreshing the access token once if it has expired.
 * A second 401 means the session is genuinely gone.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.anonymous ? null : (hooks.getSession()?.accessToken ?? null);

  let response: Response;
  try {
    response = await send(path, options, token);
  } catch (error) {
    // fetch only rejects for network-level failures and aborts.
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiRequestError(
      'OFFLINE',
      aborted ? 'That took too long. Check your connection.' : 'You appear to be offline.',
      0,
    );
  }

  if (response.status === 401 && !options.anonymous) {
    const refreshed = await hooks.refreshSession();
    if (!refreshed) {
      hooks.onAuthLost();
      throw await toError(response);
    }
    response = await send(path, options, refreshed.accessToken);
    if (response.status === 401) {
      hooks.onAuthLost();
      throw await toError(response);
    }
  }

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
