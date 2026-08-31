/** Exercise routes (FR-EX-01..09). */
import { z } from 'zod';
import {
  createExerciseRequestSchema,
  exerciseDetailSchema,
  exerciseSummarySchema,
  listExercisesQuerySchema,
  pageSchema,
  routes,
  taxonomyResponseSchema,
  updateExerciseRequestSchema,
  uuidSchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth.js';
import * as exerciseService from '../services/exercise-service.js';
import { getTaxonomy } from '../services/taxonomy-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const exerciseParams = z.object({ id: uuidSchema });

export async function exerciseRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.taxonomy,
    {
      preHandler: app.requireUser,
      schema: { response: { 200: taxonomyResponseSchema } },
    },
    async (_request, reply) => {
      // The taxonomy changes when an admin edits it, which is rare; a short
      // cache keeps the client fast without going stale for long (NFR-P-03).
      reply.header('Cache-Control', 'private, max-age=300');
      return getTaxonomy(db);
    },
  );

  typed.get(
    routes.exercises.list,
    {
      preHandler: app.requireUser,
      schema: {
        querystring: listExercisesQuerySchema,
        response: { 200: pageSchema(exerciseSummarySchema) },
      },
    },
    async (request) => exerciseService.listExercises(db, currentUser(request).id, request.query),
  );

  typed.get(
    routes.exercises.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: exerciseParams, response: { 200: exerciseDetailSchema } },
    },
    async (request) =>
      exerciseService.getExercise(db, currentUser(request).id, request.params.id),
  );

  typed.post(
    routes.exercises.list,
    {
      preHandler: app.requireUser,
      schema: { body: createExerciseRequestSchema, response: { 201: exerciseDetailSchema } },
    },
    async (request, reply) => {
      const created = await exerciseService.createCustomExercise(
        db,
        currentUser(request).id,
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  typed.patch(
    routes.exercises.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: exerciseParams,
        body: updateExerciseRequestSchema,
        response: { 200: exerciseDetailSchema },
      },
    },
    async (request) =>
      exerciseService.updateCustomExercise(
        db,
        currentUser(request).id,
        request.params.id,
        request.body,
      ),
  );

  typed.delete(
    routes.exercises.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: exerciseParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (request) => {
      await exerciseService.archiveCustomExercise(db, currentUser(request).id, request.params.id);
      return { ok: true as const };
    },
  );
}
