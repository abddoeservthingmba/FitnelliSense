/**
 * NFR-C-10: an automated test asserts that an allowed origin receives CORS
 * headers and a disallowed origin does not.
 *
 * This is the check that would have caught the CORS problems §12 exists to
 * prevent, and it deliberately needs no database — it must never be skipped.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { nullMailer } from '../src/lib/mailer';
import { nullFoodLookup } from '../src/lib/open-food-facts';
import { loadConfig } from '../src/config';
import { createStorage } from '../src/lib/r2';
import type { DatabaseHandle } from '../src/db/client';

const ALLOWED = 'http://localhost:8081';
const DISALLOWED = 'https://evil.example.com';

/**
 * CORS is decided before any handler runs, so the preflight path needs no real
 * database. A stub keeps this suite fast and dependency-free.
 */
const stubDatabase = {
  db: {} as DatabaseHandle['db'],
  sql: {} as DatabaseHandle['sql'],
  close: async () => {},
} satisfies DatabaseHandle;

describe('CORS', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_PEPPER: 'b'.repeat(32),
      CORS_ORIGINS: `${ALLOWED},http://localhost:19006`,
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
      mailer: nullMailer,
      foodLookup: nullFoodLookup,
      startedAt: new Date(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const preflight = (origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/login',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

  it('echoes an allowlisted origin exactly (NFR-C-01)', async () => {
    const response = await preflight(ALLOWED);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('sends no CORS headers for an origin that is not listed (NFR-C-08)', async () => {
    const response = await preflight(DISALLOWED);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    // And it does not leak the allowlist in a bespoke error body.
    expect(response.body).not.toContain('localhost');
  });

  it('never answers with a wildcard', async () => {
    const response = await preflight(ALLOWED);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('allows exactly the methods and headers §12.2 lists', async () => {
    const response = await preflight(ALLOWED);
    const methods = String(response.headers['access-control-allow-methods']);
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']) {
      expect(methods).toContain(method);
    }

    const headers = String(response.headers['access-control-allow-headers']).toLowerCase();
    for (const header of ['authorization', 'content-type', 'idempotency-key', 'x-request-id']) {
      expect(headers).toContain(header);
    }
  });

  it('exposes the correlation id to the browser (NFR-C-04)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED },
    });
    expect(String(response.headers['access-control-expose-headers']).toLowerCase()).toContain(
      'x-request-id',
    );
  });

  it('does not allow credentials, because tokens travel in a header (NFR-C-05)', async () => {
    const response = await preflight(ALLOWED);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('caches the preflight for ten minutes (NFR-C-06)', async () => {
    const response = await preflight(ALLOWED);
    expect(response.headers['access-control-max-age']).toBe('600');
  });

  it('serves a request with no Origin at all, as native Android sends (NFR-C-07)', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });
});
