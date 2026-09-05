/**
 * Form analysis routes — FR-VID-*.
 *
 * Five endpoints, and the shape is the point: the API issues a reference id
 * and a presigned target, and never touches the video itself. A free instance
 * could not carry an 80 MB upload, so the client talks to R2 directly.
 */
import { z } from 'zod';
import {
  analysisListSchema,
  analysisSchema,
  requestVideoUploadSchema,
  uuidSchema,
  videoUploadTargetSchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth';
import * as analysis from '../services/analysis-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;
  const storage = app.ctx.storage;

  /**
   * Ask for somewhere to put a video of this set.
   *
   * Returns the reference id, which is the analysis row's own id. Issued
   * before the upload deliberately — see the service.
   */
  typed.post(
    '/sets/:setId/video',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ setId: uuidSchema }),
        body: requestVideoUploadSchema,
        response: { 201: videoUploadTargetSchema },
      },
    },
    async (request, reply) => {
      const target = await analysis.requestVideoUpload(
        db,
        storage,
        currentUser(request).id,
        request.params.setId,
        request.body,
      );
      return reply.status(201).send(target);
    },
  );

  /**
   * Confirm the upload landed, which queues the work.
   *
   * Idempotent: the client cannot tell whether its first attempt got through,
   * so a repeat has to be a success rather than a conflict.
   */
  typed.post(
    '/analyses/:analysisId/uploaded',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ analysisId: uuidSchema }),
        response: { 200: analysisSchema },
      },
    },
    async (request) =>
      analysis.confirmVideoUpload(db, currentUser(request).id, request.params.analysisId),
  );

  /** One analysis: status, result, and a short-lived playback URL. */
  typed.get(
    '/analyses/:analysisId',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ analysisId: uuidSchema }),
        response: { 200: analysisSchema },
      },
    },
    async (request) =>
      analysis.getAnalysis(db, storage, currentUser(request).id, request.params.analysisId),
  );

  /** Every analysis of a set, newest first. */
  typed.get(
    '/sets/:setId/analyses',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ setId: uuidSchema }),
        response: { 200: analysisListSchema },
      },
    },
    async (request) =>
      analysis.listSetAnalyses(db, storage, currentUser(request).id, request.params.setId),
  );

  /**
   * Every analysis in one workout, so a history screen can show which sets
   * were filmed without asking once per set.
   */
  typed.get(
    '/workouts/:workoutId/analyses',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ workoutId: uuidSchema }),
        response: { 200: analysisListSchema },
      },
    },
    async (request) =>
      analysis.listWorkoutAnalyses(db, storage, currentUser(request).id, request.params.workoutId),
  );

  /**
   * Delete an analysis and its video.
   *
   * A real delete, not an archive: this is the one thing in the app that holds
   * a recording of someone's face and their gym, so "remove it" has to mean
   * removed.
   */
  typed.delete(
    '/analyses/:analysisId',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ analysisId: uuidSchema }),
        // 200 { ok: true }, matching every other delete in this API rather
        // than introducing a second convention for one route.
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await analysis.deleteAnalysis(
        db,
        storage,
        currentUser(request).id,
        request.params.analysisId,
      );
      return { ok: true as const };
    },
  );
}
