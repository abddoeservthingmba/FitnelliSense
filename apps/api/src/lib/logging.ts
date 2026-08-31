/**
 * Structured logging (NFR-O-03, NFR-O-10, NFR-S-07).
 *
 * Every line is JSON with a fixed shape. No PII: emails, tokens and request
 * bodies never reach a log. The user is identified by a salted hash so a
 * support question can still be traced to one account's activity.
 */
import { createHash } from 'node:crypto';
import type { FastifyServerOptions } from 'fastify';
import type { Config } from '../config';

type LoggerOptions = Exclude<FastifyServerOptions['logger'], boolean | undefined>;

/**
 * A stable, non-reversible user identifier for logs. Salted with the refresh
 * pepper so the hash cannot be recomputed from a leaked log alone.
 */
export function hashUserId(userId: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${userId}`).digest('hex').slice(0, 16);
}

export function buildLoggerOptions(config: Config): LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    base: { service: 'api', commit: config.COMMIT_SHA, env: config.NODE_ENV },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    // Belt and braces: nothing below should ever be logged, but if a plugin
    // logs a whole request object, these keys are redacted rather than leaked.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["idempotency-key"]',
        'req.body',
        'res.headers["set-cookie"]',
        'password',
        'passwordHash',
        'refreshToken',
        'accessToken',
        'email',
        'token',
      ],
      censor: '[redacted]',
    },
    serializers: {
      req: (request: {
        id: string;
        method: string;
        url: string;
        routeOptions?: { url?: string };
      }) => ({
        requestId: request.id,
        method: request.method,
        // The matched route pattern, not the URL: no ids, no query strings.
        route: request.routeOptions?.url ?? request.url.split('?')[0],
      }),
      res: (reply: { statusCode: number }) => ({ status: reply.statusCode }),
    },
    ...(config.isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
          },
        }
      : {}),
  };
}
