/**
 * Application context: the config, database and storage every route needs,
 * attached once so nothing reaches for a module-level singleton.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { DatabaseHandle } from '../db/client.js';
import type { Storage } from '../lib/r2.js';
import type { TokenConfig } from '../lib/tokens.js';

export interface AppContext {
  readonly config: Config;
  readonly database: DatabaseHandle;
  readonly storage: Storage;
  readonly tokens: TokenConfig;
  readonly startedAt: Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    readonly ctx: AppContext;
  }
}

export const contextPlugin = fp(
  async (app: FastifyInstance, options: { context: AppContext }) => {
    app.decorate('ctx', options.context);
  },
  { name: 'app-context' },
);
