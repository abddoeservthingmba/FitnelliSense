/**
 * The error envelope (BRD §10.2).
 *
 * This exists because a validation failure once returned Fastify's own 500
 * envelope instead of a 400 with field paths — the client's inline form errors
 * key on `details[].path`, so the shape is load-bearing, not cosmetic.
 *
 * No database: validation and auth both fail before any handler runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createStorage } from '../src/lib/r2';
import type { DatabaseHandle } from '../src/db/client';

const stubDatabase = {
  db: {} as DatabaseHandle['db'],
  sql: {} as DatabaseHandle['sql'],
  close: async () => {},
} satisfies DatabaseHandle;

describe('error envelope', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_PEPPER: 'b'.repeat(32),
      CORS_ORIGINS: 'http://localhost:8081',
      LOG_LEVEL: 'silent',
    });

    app = await buildApp({
      config,
      database: stubDatabase,
      storage: createStorage(config),
      tokens: {
        accessSecret: config.JWT_ACCESS_SECRET,
        refreshPepper: config.JWT_REFRESH_PEPPER,
        accessTtlSecs: config.ACCESS_TOKEN_TTL,
        refreshTtlSecs: config.REFRESH_TOKEN_TTL,
      },
      startedAt: new Date(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a bad payload as 400, with one detail per field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'nope', password: 'short', displayName: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; details: { path: string; message: string }[]; requestId?: string };
    }>();

    expect(body.error.code).toBe('VALIDATION_ERROR');
    // Field paths are what the client's inline errors match on.
    expect(body.error.details.map((detail) => detail.path).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
    expect(body.error.requestId).toBeTruthy();
  });

  it('never returns Fastify’s own error shape', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'nope' },
    });

    const body = response.json<Record<string, unknown>>();
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('statusCode');
  });

  it('answers 401 in the same envelope for a missing token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('answers 404 in the same envelope for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects malformed JSON as a validation error, not a crash', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('echoes the correlation id on an error response (NFR-O-04)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { 'x-request-id': 'trace-abcdef123456' },
    });
    expect(response.headers['x-request-id']).toBe('trace-abcdef123456');
    expect(response.json<{ error: { requestId: string } }>().error.requestId).toBe(
      'trace-abcdef123456',
    );
  });
});
