/**
 * Catalogue export/import (FR-ADM-07).
 *
 * The round-trip that keeps content reviewable: export produces exactly the
 * file that lives at `content/exercises.seed.json`, and import accepts it back
 * idempotently.
 */
import { seedCatalogueSchema } from '@fi/shared';
import { z } from 'zod';
import { routes } from '@fi/shared';
import { exportCatalogue, importCatalogue } from '../../services/content-service';
import { currentUser } from '../../plugins/auth';
import { recordAudit } from '../../services/audit-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const importStatsSchema = z.object({
  muscleGroups: z.number().int(),
  muscles: z.number().int(),
  equipment: z.number().int(),
  exercisesCreated: z.number().int(),
  exercisesUpdated: z.number().int(),
  mediaAssets: z.number().int(),
});

export async function adminContentRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.admin.contentExport,
    { schema: { response: { 200: seedCatalogueSchema } } },
    async (_request, reply) => {
      reply.header('Content-Disposition', 'attachment; filename="exercises.seed.json"');
      return exportCatalogue(db);
    },
  );

  typed.post(
    routes.admin.contentImport,
    {
      // The catalogue is larger than the default body limit for this API.
      bodyLimit: 8 * 1024 * 1024,
      schema: { body: seedCatalogueSchema, response: { 200: importStatsSchema } },
    },
    async (request) => {
      const actorId = currentUser(request).id;
      const stats = await importCatalogue(db, request.body, { verifiedBy: actorId });

      await recordAudit(db, {
        actorId,
        action: 'content.import',
        entityType: 'catalogue',
        entityId: 'exercises.seed.json',
        diff: stats,
        requestId: request.id,
      });

      return stats;
    },
  );
}
