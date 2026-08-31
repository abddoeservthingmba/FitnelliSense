/** Routine routes (FR-RT-01..05, FR-HP-03). */
import { z } from 'zod';
import {
  pageSchema,
  routineDetailSchema,
  routineSummarySchema,
  routes,
  saveRoutineRequestSchema,
  shortTextSchema,
  uuidSchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth';
import * as routineService from '../services/routine-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const routineParams = z.object({ id: uuidSchema });
const listQuery = z.object({ includeArchived: z.stringbool().default(false) });

export async function routineRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.routines.list,
    {
      preHandler: app.requireUser,
      schema: { querystring: listQuery, response: { 200: pageSchema(routineSummarySchema) } },
    },
    async (request) =>
      routineService.listRoutines(db, currentUser(request).id, request.query),
  );

  typed.post(
    routes.routines.list,
    {
      preHandler: app.requireUser,
      schema: { body: saveRoutineRequestSchema, response: { 201: routineDetailSchema } },
    },
    async (request, reply) => {
      const routine = await routineService.saveRoutine(db, currentUser(request).id, request.body);
      return reply.status(201).send(routine);
    },
  );

  typed.get(
    routes.routines.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: routineParams, response: { 200: routineDetailSchema } },
    },
    async (request) => routineService.getRoutine(db, currentUser(request).id, request.params.id),
  );

  // PUT, not PATCH: a routine is replaced wholesale, which is what makes
  // reordering unambiguous.
  typed.put(
    routes.routines.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: routineParams,
        body: saveRoutineRequestSchema,
        response: { 200: routineDetailSchema },
      },
    },
    async (request) =>
      routineService.saveRoutine(db, currentUser(request).id, request.body, request.params.id),
  );

  typed.delete(
    routes.routines.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: routineParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (request) => {
      await routineService.archiveRoutine(db, currentUser(request).id, request.params.id);
      return { ok: true as const };
    },
  );

  typed.post(
    routes.routines.duplicate(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: routineParams, response: { 201: routineDetailSchema } },
    },
    async (request, reply) => {
      const copy = await routineService.duplicateRoutine(
        db,
        currentUser(request).id,
        request.params.id,
      );
      return reply.status(201).send(copy);
    },
  );

  // FR-HP-03: turn a logged workout into a reusable routine.
  typed.post(
    '/routines/from-workout',
    {
      preHandler: app.requireUser,
      schema: {
        body: z.object({ workoutId: uuidSchema, name: shortTextSchema }),
        response: { 201: routineDetailSchema },
      },
    },
    async (request, reply) => {
      const routine = await routineService.routineFromWorkout(
        db,
        currentUser(request).id,
        request.body.workoutId,
        request.body.name,
      );
      return reply.status(201).send(routine);
    },
  );
}
