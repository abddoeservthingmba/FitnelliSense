/**
 * Correlation IDs (NFR-O-04).
 *
 * Accepted from `X-Request-Id` when the client sends one, generated otherwise;
 * echoed on the response, present on every log line for the request, and
 * forwarded to the CV service in Phase 5.
 */
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { HEADERS } from '@fi/shared';
import type { FastifyInstance } from 'fastify';

/** A client-supplied id is only trusted if it is short and printable. */
const SAFE_REQUEST_ID = /^[\w.:-]{8,128}$/;

export const requestContextPlugin = fp(
  async (app: FastifyInstance) => {
    app.addHook('onRequest', async (request, reply) => {
      reply.header(HEADERS.requestId, request.id);
    });
  },
  { name: 'request-context' },
);

export function requestIdFactory(request: { headers: Record<string, unknown> }): string {
  const supplied = request.headers[HEADERS.requestId];
  if (typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied)) return supplied;
  return randomUUID();
}
