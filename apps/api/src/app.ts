/**
 * Server assembly. Everything the API is, in one readable file.
 *
 * `buildApp` takes its context as an argument so tests build a server against a
 * test database without touching process state.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { API_PREFIX, HEADERS } from '@fi/shared';
import { buildLoggerOptions } from './lib/logging';
import { contextPlugin, type AppContext } from './plugins/context';
import { requestContextPlugin, requestIdFactory } from './plugins/request-context';
import { errorHandlerPlugin } from './plugins/error-handler';
import { authPlugin } from './plugins/auth';
import { idempotencyPlugin } from './plugins/idempotency';
import { registerRoutes } from './routes/index';
import { healthRoutes } from './routes/health';
import { legalRoutes } from './routes/legal';
import { rateLimited } from './lib/errors';

export async function buildApp(context: AppContext): Promise<FastifyInstance> {
  const { config } = context;

  const app = Fastify({
    logger: buildLoggerOptions(config),
    genReqId: requestIdFactory,
    // Trust Render's proxy so rate limiting sees the real client address.
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB: this API never carries media bytes.
  }).withTypeProvider<ZodTypeProvider>();

  // Zod is the validator on the way in and the serializer on the way out, so
  // the shared schemas are enforced in both directions (NFR-S-05, "contract"
  // level of the testing strategy in §14.3).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(contextPlugin, { context });
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);

  await app.register(helmet, {
    // The API serves JSON to two app clients, never HTML.
    contentSecurityPolicy: false,
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  // §12: an exact-match allowlist, no wildcards, no credentials (NFR-C-05).
  await app.register(cors, {
    origin: (origin, callback) => {
      // Native Android sends no Origin at all and is not subject to CORS
      // (NFR-C-07); a browser request from an unlisted origin simply gets no
      // CORS headers back (NFR-C-08).
      if (!origin) return callback(null, true);
      callback(null, config.CORS_ORIGINS.includes(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', HEADERS.idempotencyKey, HEADERS.requestId],
    exposedHeaders: [HEADERS.requestId],
    credentials: false,
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.GLOBAL_RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute',
    // Per user when we know who they are, per IP otherwise.
    keyGenerator: (request) => request.user?.id ?? request.ip,
    errorResponseBuilder: (_request, context) => {
      throw rateLimited(Math.ceil(context.ttl / 1000));
    },
  });

  await app.register(authPlugin);
  await app.register(idempotencyPlugin);

  // Health lives at the root as well as under the version prefix: uptime
  // monitors and Render's own probe expect `/health` (NFR-O-06).
  await app.register(healthRoutes);
  // The privacy policy is a public page, not an API resource: no version
  // prefix, so its URL can go in an app store listing and stay put.
  await app.register(legalRoutes);
  await app.register(registerRoutes, { prefix: API_PREFIX });

  return app;
}
