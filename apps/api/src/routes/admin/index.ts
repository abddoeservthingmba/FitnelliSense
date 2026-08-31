/**
 * The /admin namespace (FR-ADM-01, NFR-S-11).
 *
 * One guard for the whole namespace, applied as a hook rather than per route,
 * so a new admin route cannot be added without it. Non-admins receive 404, so
 * the namespace is not discoverable.
 */
import { adminExerciseRoutes } from './exercises.js';
import { adminTaxonomyRoutes } from './taxonomy.js';
import { adminMediaRoutes } from './media.js';
import { adminContentRoutes } from './content.js';
import type { FastifyInstance } from 'fastify';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAdmin);

  // NFR-S-11: admin routes are limited independently of user routes.
  app.addHook('onRoute', (route) => {
    route.config = {
      ...route.config,
      rateLimit: { max: app.ctx.config.ADMIN_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' },
    };
  });

  await app.register(adminExerciseRoutes);
  await app.register(adminTaxonomyRoutes);
  await app.register(adminMediaRoutes);
  await app.register(adminContentRoutes);
}
