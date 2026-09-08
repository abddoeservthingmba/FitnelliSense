/**
 * The worker's SQL, against a real Postgres.
 *
 * THIS IS THE TEST THAT PAYS FOR THE RAW-SQL DECISION. `store.ts` writes its
 * statements out rather than sharing the API's Drizzle schema, and the risk
 * that buys is drift: a column renamed in `apps/api/src/db/schema.ts` would
 * break this worker with no compiler to catch it. Every column and every join
 * the worker depends on is exercised here, so the break happens in CI with the
 * field named rather than in production with a row stuck in `processing`.
 *
 * Skips without `TEST_DATABASE_URL`, which is the convention across this repo:
 * integration suites are silent locally and always run in CI.
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createStore, type Claimed, type Store } from './store';
import type { Config } from './config';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Refuse to run against anything that is not obviously a test database.
 *
 * This suite truncates tables. `TEST_DATABASE_URL` and `DATABASE_URL` point at
 * the same Neon instance and differ only in the database name, which is one
 * copied line away from being the same string — and the failure would not be a
 * failing test, it would be a production database with no rows in it.
 */
function assertSafe(url: string): void {
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(database)) {
    throw new Error(
      `refusing to run destructive tests against database "${database}" — ` +
        'TEST_DATABASE_URL must name a database with "test" in it',
    );
  }
  if (process.env.DATABASE_URL === url) {
    throw new Error('TEST_DATABASE_URL and DATABASE_URL are the same database');
  }
}

const MIGRATIONS = resolve(import.meta.dirname, '../../api/src/db/migrations');

function workerConfig(url: string): Config {
  return {
    DATABASE_URL: url,
    R2_ACCOUNT_ID: 'x',
    R2_BUCKET: 'x',
    R2_ACCESS_KEY_ID: 'x',
    R2_SECRET_ACCESS_KEY: 'x',
    ANALYZER_PYTHON: 'python',
    ANALYZER_DIR: '.',
    POLL_INTERVAL_MS: 1_000,
    ANALYSIS_TIMEOUT_MS: 60_000,
  };
}

describeIntegration('the worker store', () => {
  const url = TEST_DATABASE_URL as string;
  let sql: postgres.Sql;
  let store: Store;
  let userId: string;
  let setId: string;

  beforeAll(async () => {
    assertSafe(url);
    sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
    store = createStore(workerConfig(url));
  });

  afterAll(async () => {
    await store.close();
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`
      truncate table cv_analyses, workout_sets, workout_exercises, workouts,
        exercises, muscle_groups, user_profiles, users restart identity cascade
    `;

    userId = randomUUID();
    const workoutId = randomUUID();
    const exerciseId = randomUUID();
    const workoutExerciseId = randomUUID();
    setId = randomUUID();

    await sql`
      INSERT INTO users (id, email) VALUES (${userId}, ${`lifter-${userId}@example.test`})
    `;
    await sql`
      INSERT INTO exercises (id, slug, name) VALUES (${exerciseId}, 'deadlift', 'Deadlift')
    `;
    await sql`
      INSERT INTO workouts (id, user_id, started_at) VALUES (${workoutId}, ${userId}, now())
    `;
    await sql`
      INSERT INTO workout_exercises (id, workout_id, exercise_id, position)
      VALUES (${workoutExerciseId}, ${workoutId}, ${exerciseId}, 1)
    `;
    await sql`
      INSERT INTO workout_sets (id, workout_exercise_id, position)
      VALUES (${setId}, ${workoutExerciseId}, 1)
    `;
  });

  async function queue(options?: {
    seed?: unknown;
    requested?: boolean;
    status?: string;
    clipStartSecs?: number;
  }): Promise<string> {
    const id = randomUUID();
    await sql`
      INSERT INTO cv_analyses
        (id, user_id, workout_set_id, video_r2_key, status, analysis_requested,
         clip_start_secs, clip_end_secs, seed)
      VALUES (${id}, ${userId}, ${setId}, ${`cv/${userId}/${id}.mp4`},
              ${options?.status ?? 'queued'}, ${options?.requested ?? true},
              ${options?.clipStartSecs ?? 0}, 30,
              ${options?.seed === undefined ? null : JSON.stringify(options.seed)}::jsonb)
    `;
    return id;
  }

  /**
   * A timestamp column, as the raw driver hands it back.
   *
   * `postgres` returns `timestamptz` as a string here, where the API's Drizzle
   * setup parses it into a Date. Asserted as "a real instant" rather than as an
   * instance of Date, so the test is about the column having been written and
   * not about which driver read it.
   */
  const isInstant = (value: unknown): boolean =>
    value !== null && value !== undefined && Number.isFinite(Date.parse(String(value)));

  it('claims a queued analysis and marks it processing', async () => {
    const id = await queue();
    const claimed = await store.claim();

    expect(claimed?.id).toBe(id);
    expect(claimed?.userId).toBe(userId);
    expect(claimed?.videoR2Key).toContain(userId);

    const [row] = await sql<{ status: string; startedAt: unknown }[]>`
      SELECT status, started_at AS "startedAt" FROM cv_analyses WHERE id = ${id}
    `;
    expect(row?.status).toBe('processing');
    // Recovering an abandoned row depends on this being set at claim time.
    expect(isInstant(row?.startedAt)).toBe(true);
  });

  it('claims nothing when there is nothing queued', async () => {
    expect(await store.claim()).toBeNull();
  });

  it('never claims the same row twice', async () => {
    // The whole safety property of a conditional UPDATE as a queue.
    await queue();
    expect(await store.claim()).not.toBeNull();
    expect(await store.claim()).toBeNull();
  });

  it('leaves a clip nobody asked to measure alone', async () => {
    // `stored_only` is terminal, and a row with `analysis_requested = false`
    // must never be picked up — the user chose to film without being scored.
    await queue({ requested: false });
    expect(await store.claim()).toBeNull();
  });

  it('reads back the tap exactly as it was stored', async () => {
    await queue({ seed: { x: 0.2083, y: 0.75, atSecs: 0 } });
    const claimed = await store.claim();
    expect(claimed?.seed).toEqual({ x: 0.2083, y: 0.75, atSecs: 0 });
  });

  it('treats a clip with no tap as a clip with no tap', async () => {
    await queue();
    expect((await store.claim())?.seed).toBeNull();
  });

  it('rejects a stored seed that is not a seed', async () => {
    // The column is jsonb, so nothing at the database level stops a bad write.
    // Parsing at the boundary means a malformed seed fails loudly here rather
    // than reaching the analyzer as `undefined,undefined`.
    await queue({ seed: { x: 4, y: 'left' } });
    await expect(store.claim()).rejects.toThrow();
  });

  it('finds the exercise through the workout join', async () => {
    const id = await queue();
    const claimed = (await store.claim()) as Claimed;
    expect(claimed.id).toBe(id);
    expect(await store.exerciseSlug(claimed)).toBe('deadlift');
  });

  it('will not read an analysis through the wrong user', async () => {
    await queue();
    const claimed = (await store.claim()) as Claimed;
    const impostor: Claimed = { ...claimed, userId: randomUUID() };
    expect(await store.exerciseSlug(impostor)).toBeNull();
  });

  it('writes a result, a rep count and a completion time', async () => {
    const id = await queue();
    const claimed = (await store.claim()) as Claimed;
    await store.complete(claimed, { verticalRangeM: 0.54 }, 3);

    const [row] = await sql<
      { status: string; repCount: number; result: unknown; completedAt: unknown }[]
    >`
      SELECT status, rep_count AS "repCount", result, completed_at AS "completedAt"
      FROM cv_analyses WHERE id = ${id}
    `;
    expect(row?.status).toBe('complete');
    expect(row?.repCount).toBe(3);
    expect(row?.result).toEqual({ verticalRangeM: 0.54 });
    expect(isInstant(row?.completedAt)).toBe(true);
  });

  it('writes a failure with a message and no result', async () => {
    const id = await queue();
    const claimed = (await store.claim()) as Claimed;
    await store.fail(claimed, 'We could not tell which plate to follow.');

    const [row] = await sql<{ status: string; error: string; result: unknown }[]>`
      SELECT status, error, result FROM cv_analyses WHERE id = ${id}
    `;
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('We could not tell which plate to follow.');
    expect(row?.result).toBeNull();
  });

  it('will not write to an analysis belonging to someone else', async () => {
    const id = await queue();
    const claimed = (await store.claim()) as Claimed;
    await store.complete({ ...claimed, userId: randomUUID() }, { verticalRangeM: 9 }, 99);

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM cv_analyses WHERE id = ${id}
    `;
    // Still processing: the scoped UPDATE matched nothing.
    expect(row?.status).toBe('processing');
  });

  it('requeues a row a killed worker abandoned', async () => {
    const id = await queue();
    await store.claim();
    await sql`UPDATE cv_analyses SET started_at = now() - interval '2 hours' WHERE id = ${id}`;

    expect(await store.requeueAbandoned(60_000)).toBe(1);
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM cv_analyses WHERE id = ${id}
    `;
    expect(row?.status).toBe('queued');
  });

  it('leaves a row that is still being worked on', async () => {
    // Claimed a moment ago. Requeueing it would run two analyses of one clip.
    await queue();
    await store.claim();
    expect(await store.requeueAbandoned(60_000)).toBe(0);
  });

  it('requeues a row that predates the started_at column', async () => {
    const id = await queue({ status: 'processing' });
    expect(await store.requeueAbandoned(60_000)).toBe(1);
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM cv_analyses WHERE id = ${id}
    `;
    expect(row?.status).toBe('queued');
  });
});
