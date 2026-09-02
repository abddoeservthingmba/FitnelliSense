/**
 * Training insights (FR-AI-04).
 *
 * `today` is a query parameter because a window boundary is a local calendar
 * fact — the same reason the Hunter System and `/progress/summary` take one.
 * The server does not guess a timezone.
 */
import { insightsQuerySchema, trainingInsightsSchema, routes } from '@fi/shared';
import { currentUser } from '../plugins/auth';
import { trainingInsights } from '../services/insights-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.insights,
    {
      preHandler: app.requireUser,
      schema: { querystring: insightsQuerySchema, response: { 200: trainingInsightsSchema } },
    },
    async (request) =>
      trainingInsights(
        db,
        currentUser(request).id,
        request.query.window,
        request.query.today ?? new Date().toISOString().slice(0, 10),
      ),
  );
}
