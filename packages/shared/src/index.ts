/**
 * @fi/shared — the API contract.
 *
 * BRD NFR-M-02 / §16.1: these Zod schemas are the single source of truth for
 * every shape crossing the wire. Types are derived with `z.infer`; nothing here
 * has a hand-written twin on either side.
 */
export * from './primitives';
export * from './enums';
export * from './errors';
export * from './auth';
export * from './profile';
export * from './taxonomy';
export * from './media';
export * from './exercise';
export * from './routine';
export * from './workout';
export * from './progress';
export * from './hunter';
export * from './nutrition';
export * from './content';
export * from './health';
export * from './routes';
