/**
 * Integration-test harness (BRD §14.3, "Integration": every API route against a
 * real Postgres).
 *
 * Requires `TEST_DATABASE_URL`. Without one the suites skip rather than fail,
 * so a contributor with no database still gets a green unit run, while CI —
 * which does provide one — runs them for real.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { describe } from 'vitest';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import { loadConfig, type Config } from '../../src/config';
import { createDatabase, type DatabaseHandle } from '../../src/db/client';
import type { Mailer, OutgoingEmail } from '../../src/lib/mailer';
import type { ExternalFood, FoodLookup } from '../../src/lib/open-food-facts';
import { createStorage } from '../../src/lib/r2';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/db/migrations',
);

export interface TestContext {
  app: FastifyInstance;
  database: DatabaseHandle;
  config: Config;
  /** The emails the app tried to send, so a code flow can be driven end to end. */
  mailbox: Mailbox;
  /** A stand-in for Open Food Facts, so tests never depend on the network. */
  pantry: Pantry;
}

/**
 * A controllable Open Food Facts.
 *
 * Hitting the real one from a test would make the suite depend on a volunteer
 * project's uptime and on crowd-edited data that changes underneath us. This
 * lets a test state exactly what the source returns, including returning
 * nothing — which is the case worth covering, since it is the common one.
 */
export interface Pantry {
  /** Foods the fake source will return, keyed by barcode where they have one. */
  readonly stock: ExternalFood[];
  /** Counts calls, so caching can be asserted rather than assumed. */
  calls: { search: number; barcode: number };
  set(foods: ExternalFood[]): void;
  reset(): void;
}

function createPantry(): { lookup: FoodLookup; pantry: Pantry } {
  const stock: ExternalFood[] = [];
  const calls = { search: 0, barcode: 0 };

  return {
    lookup: {
      search: async (term, limit) => {
        calls.search += 1;
        const needle = term.toLowerCase();
        return stock.filter((food) => food.name.toLowerCase().includes(needle)).slice(0, limit);
      },
      byBarcode: async (barcode) => {
        calls.barcode += 1;
        return stock.find((food) => food.barcode === barcode) ?? null;
      },
    },
    pantry: {
      stock,
      calls,
      set: (foods) => {
        stock.length = 0;
        stock.push(...foods);
      },
      reset: () => {
        stock.length = 0;
        calls.search = 0;
        calls.barcode = 0;
      },
    },
  };
}

/**
 * An in-memory mailer.
 *
 * The alternative — reading the code out of the database — would test the
 * service and skip the part most likely to break: whether the code that
 * reaches the *email* is the code the server will accept. So the test reads it
 * from the message body, the way a person would.
 */
export interface Mailbox {
  readonly sent: OutgoingEmail[];
  /** The 6-digit code from the most recent message, or null if there is none. */
  lastCode(): string | null;
  clear(): void;
}

function createMailbox(): { mailer: Mailer; mailbox: Mailbox } {
  const sent: OutgoingEmail[] = [];
  return {
    mailer: {
      isConfigured: true,
      send: async (message) => {
        sent.push(message);
        return { sent: true, id: `test-${sent.length}`, failure: null };
      },
    },
    mailbox: {
      sent,
      lastCode: () => {
        const last = sent.at(-1);
        if (!last) return null;
        // The template prints the code with a space in the middle.
        const match = /(\d{3})\s?(\d{3})/.exec(last.text);
        return match ? `${match[1]}${match[2]}` : null;
      },
      clear: () => {
        sent.length = 0;
      },
    },
  };
}

function testConfig(): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL ?? '',
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
    JWT_REFRESH_PEPPER: 'test-refresh-pepper-that-is-long-enough',
    CORS_ORIGINS: 'http://localhost:8081',
    LOG_LEVEL: 'silent',
    // A limit high enough that a test suite is not throttled by its own speed.
    GLOBAL_RATE_LIMIT_PER_MIN: '10000',
    AUTH_RATE_LIMIT_PER_MIN: '10000',
    ADMIN_RATE_LIMIT_PER_MIN: '10000',
  });
}

/** Builds a server against a migrated, empty database. */
export async function createTestContext(): Promise<TestContext> {
  const config = testConfig();
  const database = createDatabase(config);
  await migrate(database.db, { migrationsFolder });
  await truncateAll(database);

  const { mailer, mailbox } = createMailbox();
  const { lookup, pantry } = createPantry();

  const app = await buildApp({
    config,
    database,
    storage: createStorage(config),
    mailer,
    foodLookup: lookup,
    tokens: {
      accessSecret: config.JWT_ACCESS_SECRET,
      refreshPepper: config.JWT_REFRESH_PEPPER,
      accessTtlSecs: config.ACCESS_TOKEN_TTL,
      refreshTtlSecs: config.REFRESH_TOKEN_TTL,
    },
    startedAt: new Date(),
  });
  await app.ready();

  return { app, database, config, mailbox, pantry };
}

/** Between suites: same schema, no rows, sequences reset. */
export async function truncateAll(database: DatabaseHandle): Promise<void> {
  await database.db.execute(sql`
    truncate table
      admin_audit_log, idempotency_keys, cv_analyses, ai_insights,
      body_measurements, personal_records, workout_sets, workout_exercises,
      workouts, routine_exercises, routines, exercise_media, exercise_muscles,
      exercises, media_assets, email_codes, food_entries, foods, refresh_tokens,
      user_profiles, users, muscles, muscle_groups, equipment
    restart identity cascade
  `);
}

export async function closeTestContext(context: TestContext): Promise<void> {
  await context.app.close();
  await context.database.close();
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  authHeader: { authorization: string };
}

/** Registers a fresh account and returns everything a request needs. */
export async function registerUser(
  app: FastifyInstance,
  overrides: { email?: string; password?: string; displayName?: string } = {},
): Promise<TestUser> {
  const email = overrides.email ?? `user-${randomUUID()}@example.test`;
  const password = overrides.password ?? 'correct horse battery staple';

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, displayName: overrides.displayName ?? 'Test User' },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Registration failed: ${response.statusCode} ${response.body}`);
  }

  const body = response.json<{
    userId: string;
    tokens: { accessToken: string; refreshToken: string };
  }>();

  return {
    id: body.userId,
    email,
    password,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    authHeader: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

/**
 * Promotes a user the way the runbook does — a direct database flag (Q14) —
 * then signs in again, because `isAdmin` is a claim in the access token.
 */
export async function makeAdmin(context: TestContext, user: TestUser): Promise<TestUser> {
  await context.database.db.execute(sql`update users set is_admin = true where id = ${user.id}`);

  const response = await context.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: user.email, password: user.password },
  });
  const body = response.json<{ tokens: { accessToken: string; refreshToken: string } }>();

  return {
    ...user,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    authHeader: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

/**
 * A tiny typed client, so a test reads as the HTTP calls a real app makes
 * rather than as `app.inject` boilerplate.
 */
export interface TestClient {
  get(url: string): Promise<LightMyRequestResponse>;
  post(
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ): Promise<LightMyRequestResponse>;
  patch(url: string, payload?: unknown): Promise<LightMyRequestResponse>;
  put(url: string, payload?: unknown): Promise<LightMyRequestResponse>;
  del(url: string): Promise<LightMyRequestResponse>;
}

export function client(app: FastifyInstance, user?: TestUser): TestClient {
  const call = (
    method: InjectOptions['method'],
    url: string,
    payload?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> =>
    app.inject({
      method,
      url,
      headers: { ...(user ? user.authHeader : {}), ...extraHeaders },
      ...(payload === undefined ? {} : { payload: payload as InjectOptions['payload'] }),
    });

  return {
    get: (url) => call('GET', url),
    post: (url, payload, headers) => call('POST', url, payload ?? {}, headers),
    patch: (url, payload) => call('PATCH', url, payload ?? {}),
    put: (url, payload) => call('PUT', url, payload ?? {}),
    del: (url) => call('DELETE', url),
  };
}

/** Indexing helper: fails the test loudly rather than propagating undefined. */
export function first<T>(items: readonly T[], what = 'item'): T {
  const item = items[0];
  if (item === undefined) throw new Error(`Expected at least one ${what}`);
  return item;
}

/** Loads the seeded catalogue into the test database. */
export async function seedCatalogue(context: TestContext): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  const { importCatalogue } = await import('../../src/services/content-service');
  const { seedFilePath } = await import('../../src/db/paths');
  const catalogue: unknown = JSON.parse(await readFile(seedFilePath(), 'utf8'));
  await importCatalogue(context.database.db, catalogue);
}
