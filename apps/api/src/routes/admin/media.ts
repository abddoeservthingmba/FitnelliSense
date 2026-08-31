/**
 * Admin media provenance (FR-MED-02, FR-MED-08, FR-MED-09, FR-ADM-05..06).
 *
 * The takedown route is the one that matters most: it flips state to `removed`
 * and every exercise page stops showing the asset on the next request, with no
 * deploy and no broken screen (R10).
 */
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  createMediaAssetRequestSchema,
  mediaAssetSchema,
  mediaStateSchema,
  routes,
  updateMediaAssetRequestSchema,
  uuidSchema,
} from '@fi/shared';
import { mediaAssets } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { currentUser } from '../../plugins/auth.js';
import { recordAudit } from '../../services/audit-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const idParams = z.object({ id: uuidSchema });
const MAX_LISTED = 200;

function serialise(row: typeof mediaAssets.$inferSelect): z.infer<typeof mediaAssetSchema> {
  return {
    id: row.id,
    kind: row.kind,
    delivery: row.delivery,
    state: row.state,
    r2Key: row.r2Key,
    externalUrl: row.externalUrl,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    licence: row.licence,
    licenceUrl: row.licenceUrl,
    attributionText: row.attributionText,
    requiresAttribution: row.requiresAttribution,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedBy: row.verifiedBy,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    width: row.width,
    height: row.height,
    durationSecs: row.durationSecs,
  };
}

export async function adminMediaRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  // FR-ADM-06: the work queue — assets awaiting verification or found broken.
  typed.get(
    routes.admin.media,
    {
      schema: {
        querystring: z.object({ state: mediaStateSchema.optional() }),
        response: { 200: z.object({ items: z.array(mediaAssetSchema) }) },
      },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(mediaAssets)
        .where(request.query.state ? eq(mediaAssets.state, request.query.state) : undefined)
        .orderBy(desc(mediaAssets.createdAt))
        .limit(MAX_LISTED);
      return { items: rows.map(serialise) };
    },
  );

  typed.post(
    routes.admin.media,
    {
      schema: {
        body: createMediaAssetRequestSchema,
        response: { 201: mediaAssetSchema },
      },
    },
    async (request, reply) => {
      const id = newId();
      // Registration never activates an asset: a human verifies provenance
      // first, and the database refuses `active` without it anyway.
      await db.insert(mediaAssets).values({
        id,
        kind: request.body.kind,
        delivery: request.body.delivery,
        state: 'pending_review',
        r2Key: request.body.r2Key ?? null,
        externalUrl: request.body.externalUrl ?? null,
        sourceUrl: request.body.sourceUrl,
        sourceName: request.body.sourceName,
        licence: request.body.licence,
        licenceUrl: request.body.licenceUrl ?? null,
        attributionText: request.body.attributionText ?? null,
        requiresAttribution: request.body.requiresAttribution,
        width: request.body.width ?? null,
        height: request.body.height ?? null,
        durationSecs: request.body.durationSecs ?? null,
      });

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'media.create',
        entityType: 'media_asset',
        entityId: id,
        diff: request.body,
        requestId: request.id,
      });

      const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
      if (!row) throw notFound();
      return reply.status(201).send(serialise(row));
    },
  );

  typed.patch(
    routes.admin.mediaItem(':id'),
    {
      schema: {
        params: idParams,
        body: updateMediaAssetRequestSchema,
        response: { 200: mediaAssetSchema },
      },
    },
    async (request) => {
      const [before] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, request.params.id))
        .limit(1);
      if (!before) throw notFound();

      const body = request.body;
      if (body.state === 'active' && !body.verify && before.verifiedAt === null) {
        throw badRequest('Verify the provenance before activating this asset (FR-MED-02)');
      }

      const now = new Date();
      const patch: Partial<typeof mediaAssets.$inferInsert> = { updatedAt: now };
      if (body.state !== undefined) patch.state = body.state;
      if (body.licence !== undefined) patch.licence = body.licence;
      if (body.licenceUrl !== undefined) patch.licenceUrl = body.licenceUrl ?? null;
      if (body.attributionText !== undefined) patch.attributionText = body.attributionText ?? null;
      if (body.requiresAttribution !== undefined) {
        patch.requiresAttribution = body.requiresAttribution;
      }
      if (body.sourceName !== undefined) patch.sourceName = body.sourceName;
      if (body.verify) {
        patch.verifiedAt = now;
        patch.verifiedBy = currentUser(request).id;
      }

      await db.update(mediaAssets).set(patch).where(eq(mediaAssets.id, before.id));

      // FR-MED-09: provenance changes are attributable, always.
      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'media.update',
        entityType: 'media_asset',
        entityId: before.id,
        diff: { before: serialise(before), after: body },
        requestId: request.id,
      });

      const [after] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, before.id))
        .limit(1);
      if (!after) throw notFound();
      return serialise(after);
    },
  );

  typed.post(
    routes.admin.mediaTakedown(':id'),
    { schema: { params: idParams, response: { 200: mediaAssetSchema } } },
    async (request) => {
      const updated = await db
        .update(mediaAssets)
        .set({ state: 'removed', updatedAt: new Date() })
        .where(eq(mediaAssets.id, request.params.id))
        .returning();

      const row = updated[0];
      if (!row) throw notFound();

      await recordAudit(db, {
        actorId: currentUser(request).id,
        action: 'media.takedown',
        entityType: 'media_asset',
        entityId: row.id,
        requestId: request.id,
      });

      request.log.warn({ event: 'media.takedown', mediaId: row.id }, 'media asset taken down');
      return serialise(row);
    },
  );
}
