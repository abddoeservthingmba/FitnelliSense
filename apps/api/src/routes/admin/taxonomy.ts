/** Admin taxonomy management (FR-ADM-03). */
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { routes, shortTextSchema, slugSchema, taxonomyResponseSchema } from '@fi/shared';
import { equipment, muscleGroups, muscles } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { currentUser } from '../../plugins/auth.js';
import { recordAudit } from '../../services/audit-service.js';
import { getTaxonomy } from '../../services/taxonomy-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const entitySchema = z.enum(['muscle-groups', 'muscles', 'equipment']);

const createSchema = z.object({
  slug: slugSchema,
  name: shortTextSchema,
  /** Required for a muscle: the group it belongs to. */
  muscleGroupId: z.number().int().optional(),
});

const updateSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Nothing to update',
});

export async function adminTaxonomyRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.admin.taxonomy,
    { schema: { response: { 200: taxonomyResponseSchema } } },
    async () => getTaxonomy(db),
  );

  typed.post(
    routes.admin.taxonomyEntity(':entity'),
    {
      schema: {
        params: z.object({ entity: entitySchema }),
        body: createSchema,
        response: { 201: taxonomyResponseSchema },
      },
    },
    async (request, reply) => {
      const { entity } = request.params;
      const { slug, name, muscleGroupId } = request.body;

      if (entity === 'muscles') {
        if (muscleGroupId === undefined) throw badRequest('A muscle needs a muscle group');
        await db.insert(muscles).values({ slug, name, muscleGroupId });
      } else if (entity === 'muscle-groups') {
        await db.insert(muscleGroups).values({ slug, name });
      } else {
        await db.insert(equipment).values({ slug, name });
      }

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: `taxonomy.create`,
        entityType: entity,
        entityId: slug,
        diff: request.body,
        requestId: request.id,
      });

      return reply.status(201).send(await getTaxonomy(db));
    },
  );

  typed.patch(
    routes.admin.taxonomyItem(':entity', ':id'),
    {
      schema: {
        params: z.object({ entity: entitySchema, id: z.coerce.number().int() }),
        body: updateSchema,
        response: { 200: taxonomyResponseSchema },
      },
    },
    async (request) => {
      const { entity, id } = request.params;
      const patch = request.body;
      // `muscleGroupId` only exists on `muscles`; it is dropped elsewhere
      // rather than handed to the query builder as an unknown column.
      const shared = {
        ...(patch.slug === undefined ? {} : { slug: patch.slug }),
        ...(patch.name === undefined ? {} : { name: patch.name }),
      };

      const updated = await (entity === 'muscles'
        ? db
            .update(muscles)
            .set({
              ...shared,
              ...(patch.muscleGroupId === undefined
                ? {}
                : { muscleGroupId: patch.muscleGroupId }),
            })
            .where(eq(muscles.id, id))
            .returning({ id: muscles.id })
        : entity === 'muscle-groups'
          ? db
              .update(muscleGroups)
              .set(shared)
              .where(eq(muscleGroups.id, id))
              .returning({ id: muscleGroups.id })
          : db
              .update(equipment)
              .set(shared)
              .where(eq(equipment.id, id))
              .returning({ id: equipment.id }));

      if (updated.length === 0) throw notFound();

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'taxonomy.update',
        entityType: entity,
        entityId: String(id),
        diff: patch,
        requestId: request.id,
      });

      return getTaxonomy(db);
    },
  );
}
