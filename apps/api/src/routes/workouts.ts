/** Workout routes (FR-WK-01..12, FR-HP-01..02). */
import { z } from 'zod';
import {
  addSetRequestSchema,
  addWorkoutExerciseRequestSchema,
  completeWorkoutRequestSchema,
  completeWorkoutResponseSchema,
  listWorkoutsQuerySchema,
  pageSchema,
  prefillQuerySchema,
  prefillSchema,
  reorderRequestSchema,
  routes,
  startWorkoutRequestSchema,
  updateSetRequestSchema,
  updateWorkoutRequestSchema,
  uuidSchema,
  workoutDetailSchema,
  workoutSummarySchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth.js';
import { notFound } from '../lib/errors.js';
import * as workoutService from '../services/workout-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const workoutParams = z.object({ id: uuidSchema });
const workoutExerciseParams = z.object({ id: uuidSchema, weId: uuidSchema });
const setParams = z.object({ setId: uuidSchema });
const okSchema = z.object({ ok: z.literal(true) });

export async function workoutRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    routes.workouts.list,
    {
      preHandler: app.requireUser,
      schema: {
        querystring: listWorkoutsQuerySchema,
        response: { 200: pageSchema(workoutSummarySchema) },
      },
    },
    async (request) => workoutService.listWorkouts(db, currentUser(request).id, request.query),
  );

  typed.get(
    routes.workouts.active,
    { preHandler: app.requireUser, schema: { response: { 200: workoutDetailSchema } } },
    async (request) => {
      const active = await workoutService.getActiveWorkout(db, currentUser(request).id);
      if (!active) throw notFound('No workout is in progress');
      return active;
    },
  );

  // The prefill lookup sits under /workouts because it is only meaningful
  // while logging (FR-WK-06).
  typed.get(
    '/workouts/prefill',
    {
      preHandler: app.requireUser,
      schema: { querystring: prefillQuerySchema, response: { 200: prefillSchema } },
    },
    async (request) => workoutService.getPrefill(db, currentUser(request).id, request.query),
  );

  typed.post(
    routes.workouts.list,
    {
      preHandler: app.requireUser,
      schema: { body: startWorkoutRequestSchema, response: { 201: workoutDetailSchema } },
    },
    async (request, reply) => {
      const workout = await workoutService.startWorkout(db, currentUser(request).id, request.body);
      return reply.status(201).send(workout);
    },
  );

  typed.get(
    routes.workouts.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: workoutParams, response: { 200: workoutDetailSchema } },
    },
    async (request) =>
      workoutService.getWorkoutDetail(db, currentUser(request).id, request.params.id),
  );

  typed.patch(
    routes.workouts.detail(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: workoutParams,
        body: updateWorkoutRequestSchema,
        response: { 200: workoutDetailSchema },
      },
    },
    async (request) =>
      workoutService.updateWorkout(db, currentUser(request).id, request.params.id, request.body),
  );

  typed.post(
    routes.workouts.complete(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: workoutParams,
        body: completeWorkoutRequestSchema,
        response: { 200: completeWorkoutResponseSchema },
      },
    },
    async (request) =>
      workoutService.completeWorkout(
        db,
        currentUser(request).id,
        request.params.id,
        request.body.completedAt,
      ),
  );

  typed.post(
    routes.workouts.discard(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: workoutParams, response: { 200: okSchema } },
    },
    async (request) => {
      await workoutService.discardWorkout(db, currentUser(request).id, request.params.id);
      return { ok: true as const };
    },
  );

  typed.post(
    routes.workouts.exercises(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: workoutParams,
        body: addWorkoutExerciseRequestSchema,
        response: { 201: workoutDetailSchema },
      },
    },
    async (request, reply) => {
      const workout = await workoutService.addExerciseToWorkout(
        db,
        currentUser(request).id,
        request.params.id,
        request.body,
      );
      return reply.status(201).send(workout);
    },
  );

  typed.patch(
    routes.workouts.reorderExercises(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: workoutParams,
        body: reorderRequestSchema,
        response: { 200: workoutDetailSchema },
      },
    },
    async (request) =>
      workoutService.reorderWorkoutExercises(
        db,
        currentUser(request).id,
        request.params.id,
        request.body.orderedIds,
      ),
  );

  typed.delete(
    routes.workouts.exercise(':id', ':weId'),
    {
      preHandler: app.requireUser,
      schema: { params: workoutExerciseParams, response: { 200: workoutDetailSchema } },
    },
    async (request) =>
      workoutService.removeWorkoutExercise(
        db,
        currentUser(request).id,
        request.params.id,
        request.params.weId,
      ),
  );

  typed.post(
    routes.workouts.sets(':id', ':weId'),
    {
      preHandler: app.requireUser,
      schema: {
        params: workoutExerciseParams,
        body: addSetRequestSchema,
        response: { 201: workoutDetailSchema },
      },
    },
    async (request, reply) => {
      const workout = await workoutService.addSet(
        db,
        currentUser(request).id,
        request.params.id,
        request.params.weId,
        request.body,
      );
      return reply.status(201).send(workout);
    },
  );

  typed.patch(
    routes.sets.detail(':setId'),
    {
      preHandler: app.requireUser,
      schema: {
        params: setParams,
        body: updateSetRequestSchema,
        response: { 200: workoutDetailSchema },
      },
    },
    async (request) =>
      workoutService.updateSet(db, currentUser(request).id, request.params.setId, request.body),
  );

  typed.delete(
    routes.sets.detail(':setId'),
    {
      preHandler: app.requireUser,
      schema: { params: setParams, response: { 200: workoutDetailSchema } },
    },
    async (request) =>
      workoutService.deleteSet(db, currentUser(request).id, request.params.setId),
  );
}
