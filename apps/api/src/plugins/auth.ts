/**
 * Authentication (NFR-S-03, FR-ADM-01).
 *
 * `app.requireUser` puts the authenticated user on the request; every handler
 * that touches user data uses it and then scopes its queries by `user.id`.
 * `app.requireAdmin` answers 404 rather than 403 for a non-admin, so the admin
 * namespace is not enumerable (BRD §10.2).
 */
import fp from 'fastify-plugin';
import { notFound, unauthenticated } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { hashUserId } from '../lib/logging.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  readonly id: string;
  readonly isAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
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

    app.decorate('requireUser', async (request: FastifyRequest) => {
      const token = bearerToken(request.headers.authorization);
      if (!token) throw unauthenticated();

      const claims = await verifyAccessToken(app.ctx.tokens, token);
      request.user = { id: claims.sub, isAdmin: claims.isAdmin };

      // NFR-O-03: the hashed user id, never the raw one, joins every
      // subsequent log line for this request.
      const logger = request.log as { setBindings?: (bindings: object) => void };
      logger.setBindings?.({
        userId: hashUserId(claims.sub, app.ctx.config.JWT_REFRESH_PEPPER),
      });
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
