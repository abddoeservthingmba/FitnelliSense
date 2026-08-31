/**
 * Health endpoints (NFR-O-01, NFR-O-02, NFR-D-05).
 *
 * `/health` is shallow, fast and safe to poll on a schedule. `/health/deep`
 * touches the dependencies and is rate-limited, because on a free tier a deep
 * check is not free.
 */
import { sql } from 'drizzle-orm';
import { deepHealthResponseSchema, healthResponseSchema } from '@fi/shared';
import type { DependencyCheck } from '@fi/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

async function timed(
  name: string,
  probe: () => Promise<{ ok: boolean; detail: string | null }>,
): Promise<DependencyCheck> {
  const startedAt = Date.now();
  try {
    const result = await probe();
    return {
      name,
      status: result.ok ? 'ok' : 'degraded',
      latencyMs: Date.now() - startedAt,
      detail: result.detail,
    };
  } catch (error) {
    return {
      name,
      status: 'down',
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, storage, startedAt } = app.ctx;

  const base = () => ({
    service: 'api' as const,
    commit: config.COMMIT_SHA,
    environment: config.NODE_ENV,
    uptimeSecs: Math.round((Date.now() - startedAt.getTime()) / 1000),
    time: new Date().toISOString(),
  });

  typed.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: { response: { 200: healthResponseSchema } },
    },
    async () => ({ status: 'ok' as const, ...base() }),
  );

  typed.get(
    '/health/deep',
    {
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: { response: { 200: deepHealthResponseSchema, 503: deepHealthResponseSchema } },
    },
    async (_request, reply) => {
      const dependencies = await Promise.all([
        timed('database', async () => {
          await database.db.execute(sql`select 1`);
          return { ok: true, detail: null };
        }),
        timed('r2', () => storage.check()),
      ]);

      // R2 being absent degrades media to placeholders (NFR-B-06); only the
      // database being unreachable makes the service itself unhealthy.
      const databaseCheck = dependencies.find((check) => check.name === 'database');
      const status = databaseCheck?.status === 'ok' ? ('ok' as const) : ('down' as const);

      return reply
        .status(status === 'ok' ? 200 : 503)
        .send({ status, ...base(), dependencies });
    },
  );
}
