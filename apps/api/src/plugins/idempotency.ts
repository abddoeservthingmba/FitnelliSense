/**
 * Idempotent mutations (NFR-R-03, §8.3, §10.2).
 *
 * The outbox replays writes after a reconnect, so the same request may arrive
 * twice. With an `Idempotency-Key`:
 *   - same key + same request  -> the stored response is replayed, no re-write;
 *   - same key + different body -> 409, because the key has been reused wrongly;
 *   - no key                   -> the request runs normally.
 *
 * Records are written only for successful mutations: a failure should be
 * retryable, not frozen.
 */
import fp from 'fastify-plugin';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { HEADERS } from '@fi/shared';
import { conflict } from '../lib/errors';
import { idempotencyKeys } from '../db/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KEY_PATTERN = /^[\w.:-]{8,200}$/;

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

function requestHash(request: FastifyRequest): string {
  return createHash('sha256')
    .update(request.method)
    .update(request.url.split('?')[0] ?? '')
    .update(JSON.stringify(request.body ?? null))
    .digest('hex');
}

export const idempotencyPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorateRequest('idempotencyKey', undefined);

    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const header = request.headers[HEADERS.idempotencyKey];
      const key = typeof header === 'string' ? header.trim() : null;
      if (!key || !MUTATING_METHODS.has(request.method)) return;
      if (!KEY_PATTERN.test(key)) throw conflict('That idempotency key is not usable');
      // The key is only meaningful for an authenticated user's own writes.
      const user = request.user;
      if (!user) return;

      const scopedKey = `${user.id}:${key}`;
      request.idempotencyKey = scopedKey;

      const [existing] = await app.ctx.database.db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, scopedKey))
        .limit(1);

      if (!existing) return;
      if (existing.requestHash !== requestHash(request)) {
        throw conflict('That idempotency key was already used for a different request');
      }

      request.log.info({ replayed: true }, 'idempotent replay');
      return reply.status(existing.statusCode).send(existing.response);
    });

    app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
      const key = request.idempotencyKey;
      const user = request.user;
      if (!key || !user || reply.statusCode >= 400 || typeof payload !== 'string') return payload;

      let body: unknown;
      try {
        body = JSON.parse(payload);
      } catch {
        return payload; // Not a JSON response; nothing worth replaying.
      }

      await app.ctx.database.db
        .insert(idempotencyKeys)
        .values({
          key,
          userId: user.id,
          requestHash: requestHash(request),
          response: body,
          statusCode: reply.statusCode,
        })
        .onConflictDoNothing();

      return payload;
    });
  },
  { name: 'idempotency', dependencies: ['app-context'] },
);
