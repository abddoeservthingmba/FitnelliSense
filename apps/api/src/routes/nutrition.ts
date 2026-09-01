/**
 * Nutrition routes — FR-NUT-01..14. Thin: parse, delegate, respond.
 *
 * The date is always a path or body parameter, never inferred. A day boundary is
 * a local calendar fact and the server does not know the user's timezone — the
 * same rule the Hunter System and `/progress/summary` follow.
 */
import { z } from 'zod';
import {
  barcodeLookupParamsSchema,
  createFoodEntryRequestSchema,
  createFoodRequestSchema,
  foodEntrySchema,
  foodSchema,
  foodSearchQuerySchema,
  nutritionDaySchema,
  nutritionTargetsSchema,
  routes,
  updateFoodEntryRequestSchema,
  updateNutritionTargetsRequestSchema,
  uuidSchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth';
import * as nutrition from '../services/nutrition-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const okSchema = z.object({ ok: z.literal(true) });
const entryParams = z.object({ id: uuidSchema });
const dayParams = z.object({ date: z.iso.date() });

export async function nutritionRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const deps: nutrition.NutritionDeps = {
    db: app.ctx.database.db,
    lookup: app.ctx.foodLookup,
  };

  /**
   * Food search hits a third party, so it carries its own tighter limit —
   * looser than auth, much tighter than the global one. Open Food Facts is a
   * volunteer project and we should not let one client hammer it.
   */
  const lookupLimit = {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request: { user?: { id: string }; ip: string }) =>
        request.user?.id ?? request.ip,
    },
  };

  // -------------------------------------------------------------- the day --

  typed.get(
    routes.nutrition.day(':date'),
    {
      preHandler: app.requireUser,
      schema: { params: dayParams, response: { 200: nutritionDaySchema } },
    },
    async (request) =>
      nutrition.nutritionDay(deps, currentUser(request).id, request.params.date),
  );

  // -------------------------------------------------------------- entries --

  typed.post(
    routes.nutrition.entries,
    {
      preHandler: app.requireUser,
      schema: { body: createFoodEntryRequestSchema, response: { 201: foodEntrySchema } },
    },
    async (request, reply) => {
      const entry = await nutrition.createEntry(deps, currentUser(request).id, request.body);
      return reply.status(201).send(entry);
    },
  );

  typed.patch(
    routes.nutrition.entry(':id'),
    {
      preHandler: app.requireUser,
      schema: {
        params: entryParams,
        body: updateFoodEntryRequestSchema,
        response: { 200: foodEntrySchema },
      },
    },
    async (request) =>
      nutrition.updateEntry(deps, currentUser(request).id, request.params.id, request.body),
  );

  typed.delete(
    routes.nutrition.entry(':id'),
    {
      preHandler: app.requireUser,
      schema: { params: entryParams, response: { 200: okSchema } },
    },
    async (request) => {
      await nutrition.deleteEntry(deps, currentUser(request).id, request.params.id);
      return { ok: true as const };
    },
  );

  // -------------------------------------------------------------- targets --

  typed.get(
    routes.nutrition.targets,
    { preHandler: app.requireUser, schema: { response: { 200: nutritionTargetsSchema } } },
    async (request) => nutrition.targetsFor(deps, currentUser(request).id),
  );

  typed.put(
    routes.nutrition.targets,
    {
      preHandler: app.requireUser,
      schema: {
        body: updateNutritionTargetsRequestSchema,
        response: { 200: nutritionTargetsSchema },
      },
    },
    async (request) =>
      nutrition.updateTargets(deps, currentUser(request).id, request.body),
  );

  // ---------------------------------------------------------------- foods --

  typed.get(
    routes.nutrition.foodSearch,
    {
      preHandler: app.requireUser,
      config: lookupLimit,
      schema: {
        querystring: foodSearchQuerySchema,
        response: { 200: z.object({ items: z.array(foodSchema) }) },
      },
    },
    async (request) => ({
      items: await nutrition.searchFoods(
        deps,
        currentUser(request).id,
        request.query.q,
        request.query.limit,
      ),
    }),
  );

  typed.get(
    routes.nutrition.foodByBarcode(':barcode'),
    {
      preHandler: app.requireUser,
      config: lookupLimit,
      schema: { params: barcodeLookupParamsSchema, response: { 200: foodSchema } },
    },
    async (request) =>
      nutrition.foodByBarcode(deps, currentUser(request).id, request.params.barcode),
  );

  typed.post(
    routes.nutrition.customFoods,
    {
      preHandler: app.requireUser,
      schema: { body: createFoodRequestSchema, response: { 201: foodSchema } },
    },
    async (request, reply) => {
      const food = await nutrition.createCustomFood(deps, currentUser(request).id, request.body);
      return reply.status(201).send(food);
    },
  );
}
