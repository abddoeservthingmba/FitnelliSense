/**
 * Admin exercise management (FR-ADM-02, FR-ADM-04, FR-ADM-05).
 *
 * These write system exercises (`user_id IS NULL`) — the seeded catalogue that
 * every user sees. Each mutation is audited.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  createExerciseRequestSchema,
  exerciseDetailSchema,
  exerciseSummarySchema,
  muscleRoleSchema,
  pageSchema,
  routes,
  slugSchema,
  updateExerciseRequestSchema,
  uuidSchema,
} from '@fi/shared';
import { exerciseMedia, exerciseMuscles, exercises, mediaAssets } from '../../db/schema';
import { badRequest, notFound } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { currentUser } from '../../plugins/auth';
import { recordAudit } from '../../services/audit-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const idParams = z.object({ id: uuidSchema });
const mediaParams = z.object({ id: uuidSchema, mediaId: uuidSchema });

const createSystemExerciseSchema = createExerciseRequestSchema.extend({
  slug: slugSchema,
});

const attachMediaSchema = z.object({
  mediaId: uuidSchema,
  isPrimary: z.boolean().default(false),
  position: z.number().int().min(0).max(50).default(0),
});

async function systemExercise(
  app: FastifyInstance,
  exerciseId: string,
): Promise<typeof exercises.$inferSelect> {
  const [row] = await app.ctx.database.db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), isNull(exercises.userId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export async function adminExerciseRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.admin.exercises,
    { schema: { response: { 200: pageSchema(exerciseSummarySchema) } } },
    async () => {
      // FR-ADM-02: archived rows included, because fixing them is the point.
      const rows = await db
        .select()
        .from(exercises)
        .where(isNull(exercises.userId))
        .orderBy(asc(exercises.name));

      return {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          equipmentId: row.equipmentId,
          isUnilateral: row.isUnilateral,
          isCustom: false,
          primaryMuscleIds: [],
          primaryMediaId: null,
          archivedAt: row.archivedAt?.toISOString() ?? null,
        })),
        nextCursor: null,
      };
    },
  );

  typed.post(
    routes.admin.exercises,
    { schema: { body: createSystemExerciseSchema, response: { 201: exerciseDetailSchema } } },
    async (request, reply) => {
      const id = request.body.id ?? newId();
      await db.transaction(async (tx) => {
        await tx.insert(exercises).values({
          id,
          userId: null,
          slug: request.body.slug,
          name: request.body.name,
          description: request.body.description ?? null,
          instructions: request.body.instructions ?? null,
          equipmentId: request.body.equipmentId ?? null,
          isUnilateral: request.body.isUnilateral,
        });
        await tx
          .insert(exerciseMuscles)
          .values(request.body.muscles.map((muscle) => ({ exerciseId: id, ...muscle })));
      });

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'exercise.create',
        entityType: 'exercise',
        entityId: id,
        diff: request.body,
        requestId: request.id,
      });

      return reply.status(201).send(await detail(app, id));
    },
  );

  typed.patch(
    routes.admin.exercise(':id'),
    {
      schema: {
        params: idParams,
        body: updateExerciseRequestSchema.extend({
          slug: slugSchema.optional(),
          archived: z.boolean().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
        response: { 200: exerciseDetailSchema },
      },
    },
    async (request) => {
      const before = await systemExercise(app, request.params.id);
      const body = request.body;

      await db.transaction(async (tx) => {
        const patch: Partial<typeof exercises.$inferInsert> = { updatedAt: new Date() };
        if (body.name !== undefined) patch.name = body.name;
        if (body.slug !== undefined) patch.slug = body.slug;
        if (body.description !== undefined) patch.description = body.description ?? null;
        if (body.instructions !== undefined) patch.instructions = body.instructions ?? null;
        if (body.equipmentId !== undefined) patch.equipmentId = body.equipmentId ?? null;
        if (body.isUnilateral !== undefined) patch.isUnilateral = body.isUnilateral;
        if (body.metadata !== undefined) patch.metadata = body.metadata;
        // FR-EX-09: archive, never delete.
        if (body.archived !== undefined) patch.archivedAt = body.archived ? new Date() : null;

        await tx.update(exercises).set(patch).where(eq(exercises.id, before.id));

        if (body.muscles !== undefined) {
          await tx.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, before.id));
          await tx
            .insert(exerciseMuscles)
            .values(body.muscles.map((muscle) => ({ exerciseId: before.id, ...muscle })));
        }
      });

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'exercise.update',
        entityType: 'exercise',
        entityId: before.id,
        diff: { before: { name: before.name, slug: before.slug }, after: body },
        requestId: request.id,
      });

      return detail(app, before.id);
    },
  );

  typed.post(
    routes.admin.exerciseMedia(':id'),
    {
      schema: {
        params: idParams,
        body: attachMediaSchema,
        response: { 200: exerciseDetailSchema },
      },
    },
    async (request) => {
      const exercise = await systemExercise(app, request.params.id);

      const [asset] = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, request.body.mediaId))
        .limit(1);
      if (!asset) throw badRequest('That media asset does not exist');

      await db.transaction(async (tx) => {
        // At most one primary per exercise, enforced by a partial unique index.
        if (request.body.isPrimary) {
          await tx
            .update(exerciseMedia)
            .set({ isPrimary: false })
            .where(eq(exerciseMedia.exerciseId, exercise.id));
        }
        await tx
          .insert(exerciseMedia)
          .values({
            exerciseId: exercise.id,
            mediaId: request.body.mediaId,
            position: request.body.position,
            isPrimary: request.body.isPrimary,
          })
          .onConflictDoUpdate({
            target: [exerciseMedia.exerciseId, exerciseMedia.mediaId],
            set: { position: request.body.position, isPrimary: request.body.isPrimary },
          });
      });

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'exercise.media.attach',
        entityType: 'exercise',
        entityId: exercise.id,
        diff: request.body,
        requestId: request.id,
      });

      return detail(app, exercise.id);
    },
  );

  typed.delete(
    routes.admin.exerciseMediaItem(':id', ':mediaId'),
    { schema: { params: mediaParams, response: { 200: exerciseDetailSchema } } },
    async (request) => {
      const exercise = await systemExercise(app, request.params.id);
      await db
        .delete(exerciseMedia)
        .where(
          and(
            eq(exerciseMedia.exerciseId, exercise.id),
            eq(exerciseMedia.mediaId, request.params.mediaId),
          ),
        );

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'exercise.media.detach',
        entityType: 'exercise',
        entityId: exercise.id,
        diff: { mediaId: request.params.mediaId },
        requestId: request.id,
      });

      return detail(app, exercise.id);
    },
  );
}

/** The admin view of one exercise, including muscles and every attached asset. */
async function detail(app: FastifyInstance, exerciseId: string) {
  const db = app.ctx.database.db;
  const row = await systemExercise(app, exerciseId);

  const muscleRows = await db
    .select({ muscleId: exerciseMuscles.muscleId, role: exerciseMuscles.role })
    .from(exerciseMuscles)
    .where(eq(exerciseMuscles.exerciseId, exerciseId));

  const mediaRows = await db
    .select({
      mediaId: mediaAssets.id,
      kind: mediaAssets.kind,
      isPrimary: exerciseMedia.isPrimary,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(exerciseMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, exerciseMedia.mediaId))
    .where(eq(exerciseMedia.exerciseId, exerciseId))
    .orderBy(asc(exerciseMedia.position));

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    equipmentId: row.equipmentId,
    isUnilateral: row.isUnilateral,
    isCustom: false,
    primaryMuscleIds: muscleRows
      .filter((muscle) => muscle.role === 'primary')
      .map((muscle) => muscle.muscleId),
    primaryMediaId: mediaRows.find((media) => media.isPrimary)?.mediaId ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    description: row.description,
    instructions: row.instructions,
    muscles: muscleRows.map((muscle) => ({
      muscleId: muscle.muscleId,
      role: muscleRoleSchema.parse(muscle.role),
    })),
    media: mediaRows,
  };
}
