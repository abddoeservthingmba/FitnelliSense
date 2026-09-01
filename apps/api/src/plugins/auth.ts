/**
 * Authentication (NFR-S-03, FR-ADM-01).
 *
 * `app.requireUser` puts the authenticated user on the request; every handler
 * that touches user data uses it and then scopes its queries by `user.id`.
 * `app.requireAdmin` answers 404 rather than 403 for a non-admin, so the admin
 * namespace is not enumerable (BRD §10.2).
 */
import fp from 'fastify-plugin';
import { notFound, unauthenticated } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import { hashUserId } from '../lib/logging';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  readonly id: string;
  readonly isAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    /** Why the presented token was rejected; raised by `requireUser`. */
    authError?: unknown;
  }
  interface FastifyInstance {
    requireUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Reads a bearer token, tolerating the casing and spacing clients get wrong. */
function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export const authPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorateRequest('user', undefined);
    app.decorateRequest('authError', undefined);

    /**
     * Identification happens for every request that carries a token, in
     * `onRequest` — the earliest hook there is. Authorisation is separate, and
     * stays opt-in per route via `requireUser`.
     *
     * The split matters: Fastify runs global hooks before route-level ones, so
     * anything global that needs to know who is calling — the idempotency
     * replay check (NFR-R-03) and per-user rate limiting (NFR-S-06) — would
     * otherwise always run before `requireUser` had set `request.user`, and
     * silently behave as if every caller were anonymous.
     *
     * A bad token is recorded rather than thrown here, so a public route with
     * a stale token still works and a protected one still gets the precise
     * reason.
     */
    app.addHook('onRequest', async (request: FastifyRequest) => {
      const token = bearerToken(request.headers.authorization);
      if (!token) return;

      try {
        const claims = await verifyAccessToken(app.ctx.tokens, token);
        request.user = { id: claims.sub, isAdmin: claims.isAdmin };

        // NFR-O-03: the hashed user id, never the raw one, joins every
        // subsequent log line for this request.
        const logger = request.log as { setBindings?: (bindings: object) => void };
        logger.setBindings?.({
          userId: hashUserId(claims.sub, app.ctx.config.JWT_REFRESH_PEPPER),
        });
      } catch (error) {
        request.authError = error;
      }
    });

    app.decorate('requireUser', async (request: FastifyRequest) => {
      if (request.authError !== undefined) throw request.authError;
      if (!request.user) throw unauthenticated();
    });

    app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
      await app.requireUser(request, reply);
      if (!request.user?.isAdmin) throw notFound();
    });
  },
  { name: 'auth', dependencies: ['app-context'] },
);

/** Reads the user a `requireUser` hook has already put on the request. */
export function currentUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) throw unauthenticated();
  return request.user;
}
