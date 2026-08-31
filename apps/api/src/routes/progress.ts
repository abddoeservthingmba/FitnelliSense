/** Progress routes (FR-HP-04..07). */
import { z } from 'zod';
import {
  personalRecordSchema,
  progressSeriesQuerySchema,
  progressSeriesResponseSchema,
  progressSummaryResponseSchema,
  routes,
  uuidSchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth.js';
import * as progressService from '../services/progress-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/**
 * The dashboard's "today" comes from the client, because a streak is a local
 * calendar fact and the server has no business guessing the user's timezone.
 */
const summaryQuerySchema = z.object({
  today: z.iso.date().optional(),
});

export async function progressRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.progress.exercise(':exerciseId'),
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ exerciseId: uuidSchema }),
        querystring: progressSeriesQuerySchema,
        response: { 200: progressSeriesResponseSchema },
      },
    },
    async (request) =>
      progressService.exerciseProgress(
        db,
        currentUser(request).id,
        request.params.exerciseId,
        request.query,
      ),
  );

  typed.get(
    routes.progress.records,
    {
      preHandler: app.requireUser,
      schema: { response: { 200: z.object({ records: z.array(personalRecordSchema) }) } },
    },
    async (request) => ({ records: await progressService.listRecords(db, currentUser(request).id) }),
  );

  typed.get(
    routes.progress.summary,
    {
      preHandler: app.requireUser,
      schema: {
        querystring: summaryQuerySchema,
        response: { 200: progressSummaryResponseSchema },
      },
    },
    async (request) =>
      progressService.progressSummary(
        db,
        currentUser(request).id,
        request.query.today ?? new Date().toISOString().slice(0, 10),
      ),
  );
}
