/**
 * Media resolution (FR-MED-01, NFR-S-12).
 *
 * The one endpoint that turns a `mediaId` into something renderable. A client
 * that receives 404 here shows the placeholder (FR-MED-07) — that is a normal
 * outcome, not an error state.
 */
import { z } from 'zod';
import { resolvedMediaSchema, routes, uuidSchema } from '@fi/shared';
import { resolveMediaOrThrow, type MediaDeps } from '../services/media-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const deps: MediaDeps = {
    db: app.ctx.database.db,
    storage: app.ctx.storage,
    urlTtlSecs: app.ctx.config.MEDIA_URL_TTL_SECONDS,
  };

  typed.get(
    routes.media.url(':mediaId'),
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ mediaId: uuidSchema }),
        response: { 200: resolvedMediaSchema },
      },
    },
    async (request, reply) => {
      const resolved = await resolveMediaOrThrow(deps, request.params.mediaId);
      // Cache for slightly less than the signature's life, so a cached URL is
      // never handed out after it has expired.
      const maxAge = Math.max(60, app.ctx.config.MEDIA_URL_TTL_SECONDS - 60);
      reply.header('Cache-Control', `private, max-age=${maxAge}`);
      return resolved;
    },
  );
}
