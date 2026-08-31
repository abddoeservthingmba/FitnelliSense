/**
 * Route registration. One list, in the order of BRD §10.1, so what the API
 * exposes is answerable by reading a single file.
 */
import { authRoutes } from './auth.js';
import { meRoutes } from './me.js';
import { exerciseRoutes } from './exercises.js';
import { routineRoutes } from './routines.js';
import { workoutRoutes } from './workouts.js';
import { progressRoutes } from './progress.js';
import { mediaRoutes } from './media.js';
import { healthRoutes } from './health.js';
import { adminRoutes } from './admin/index.js';
import type { FastifyInstance } from 'fastify';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(exerciseRoutes);
  await app.register(routineRoutes);
  await app.register(workoutRoutes);
  await app.register(progressRoutes);
  await app.register(mediaRoutes);
  await app.register(healthRoutes);
  await app.register(adminRoutes);
}
