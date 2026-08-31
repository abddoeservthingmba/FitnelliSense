/**
 * @fi/shared — the API contract.
 *
 * BRD NFR-M-02 / §16.1: these Zod schemas are the single source of truth for
 * every shape crossing the wire. Types are derived with `z.infer`; nothing here
 * has a hand-written twin on either side.
 */
export * from './primitives.js';
export * from './enums.js';
export * from './errors.js';
export * from './auth.js';
export * from './profile.js';
export * from './taxonomy.js';
export * from './media.js';
export * from './exercise.js';
export * from './routine.js';
export * from './workout.js';
export * from './progress.js';
export * from './content.js';
export * from './health.js';
export * from './routes.js';
