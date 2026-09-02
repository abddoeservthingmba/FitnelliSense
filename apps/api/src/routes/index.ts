/**
 * Route registration. One list, in the order of BRD §10.1, so what the API
 * exposes is answerable by reading a single file.
 */
import { authRoutes } from './auth';
import { meRoutes } from './me';
import { exerciseRoutes } from './exercises';
import { routineRoutes } from './routines';
import { workoutRoutes } from './workouts';
import { progressRoutes } from './progress';
import { insightsRoutes } from './insights';
import { hunterRoutes } from './hunter';
import { nutritionRoutes } from './nutrition';
import { mediaRoutes } from './media';
import { healthRoutes } from './health';
import { adminRoutes } from './admin/index';
import type { FastifyInstance } from 'fastify';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(exerciseRoutes);
  await app.register(routineRoutes);
  await app.register(workoutRoutes);
  await app.register(progressRoutes);
  await app.register(insightsRoutes);
  await app.register(hunterRoutes);
  await app.register(nutritionRoutes);
  await app.register(mediaRoutes);
  await app.register(healthRoutes);
  await app.register(adminRoutes);
}
