/**
 * The worker's view of the database.
 *
 * RAW SQL RATHER THAN DRIZZLE, and it is a deliberate choice between three
 * imperfect options. The schema is defined in `apps/api/src/db/schema.ts` and
 * the API owns it. Copying the table definitions here would create exactly the
 * drift the project forbids for Zod schemas — two declarations of one shape,
 * one of which will be updated. Importing another app's source across the
 * workspace makes a deployable depend on a deployable. So instead the six
 * statements this worker needs are written out, the column names appear once
 * each, and every row that comes back is parsed by a Zod schema — so a column
 * renamed in the API fails here loudly, at the boundary, with the field named.
 *
 * If a third consumer of this schema ever appears, that is the point at which
 * it should move into `packages/db` and all three should import it. Two is not
 * yet worth the churn.
 *
 * ON `user_id` SCOPING. The project's rule is that every query is scoped by
 * the authenticated user, no exceptions. A worker has no authenticated user —
 * it is not serving a request — so the claim below deliberately scans across
 * users, and that is the one place in this system where it is correct. What is
 * preserved is the guarantee the rule exists for: the claim returns the row's
 * OWN `user_id`, and every subsequent read and write is scoped by it, so no
 * operation can touch a row belonging to anyone but the owner of the clip
 * being analysed.
 */
import postgres from 'postgres';
import { z } from 'zod';
import { barSeedSchema } from '@fi/shared';
import type { Config } from './config';

/**
 * A claimed analysis. Parsed rather than cast: this is the boundary between
 * the API's schema and this process, and an unparsed cast would turn a renamed
 * column into `undefined` flowing quietly into the analyzer's arguments.
 */
export const claimedSchema = z.object({
  id: z.string(),
  userId: z.string(),
  videoR2Key: z.string(),
  clipStartSecs: z.number().int(),
  clipEndSecs: z.number().int(),
  seed: barSeedSchema.nullable(),
});

export type Claimed = z.infer<typeof claimedSchema>;

export interface Store {
  /**
   * Take the oldest queued analysis, or null if there is nothing to do.
   *
   * ATOMIC IN ONE STATEMENT, without Redis or any other queue — the BRD rules
   * those out (§3.3.1) and none is needed. `FOR UPDATE SKIP LOCKED` inside the
   * subquery means two workers racing cannot claim the same row: the second
   * one skips the locked candidate and takes the next, or finds nothing.
   */
  claim(): Promise<Claimed | null>;
  /** The catalogue slug of the lift this clip is of, or null. */
  exerciseSlug(analysis: Claimed): Promise<string | null>;
  complete(analysis: Claimed, result: unknown, repCount: number): Promise<void>;
  /** `message` is shown to the user, so it must never carry a stack trace. */
  fail(analysis: Claimed, message: string): Promise<void>;
  /**
   * Put a row back on the queue, untouched.
   *
   * For a failure that is OURS rather than the clip's — storage unreachable,
   * most obviously. `failed` is terminal and the client tells the user a failed
   * analysis needs filming again, so marking a perfectly good clip failed
   * because our network was interfered with destroys work that is not ours to
   * destroy. This leaves the row exactly as it was found.
   */
  release(analysis: Claimed): Promise<void>;
  /**
   * Return rows abandoned mid-flight to the queue.
   *
   * A worker killed while analysing leaves its row in `processing`, and
   * nothing would ever look at it again — the claim only takes `queued`. For a
   * worker running on a laptop that is not an edge case, it is Tuesday.
   */
  requeueAbandoned(olderThanMs: number): Promise<number>;
  close(): Promise<void>;
}

export function createStore(config: Config): Store {
  const sql = postgres(config.DATABASE_URL, {
    // One connection. The worker analyses one clip at a time by design — the
    // analyzer saturates a core and decodes a whole video into memory, so
    // concurrency here would not make it faster and would risk the box.
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });

  return {
    async claim() {
      const rows = await sql`
        UPDATE cv_analyses SET status = 'processing', started_at = now()
        WHERE id = (
          SELECT inner_a.id FROM cv_analyses inner_a
          WHERE inner_a.status = 'queued' AND inner_a.analysis_requested = true
          ORDER BY inner_a.created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, user_id AS "userId", video_r2_key AS "videoR2Key",
                  clip_start_secs AS "clipStartSecs", clip_end_secs AS "clipEndSecs",
                  seed
      `;
      const row = rows[0];
      return row === undefined ? null : claimedSchema.parse(row);
    },

    async exerciseSlug(analysis) {
      /*
       * Scoped by `user_id` on BOTH the analysis and the workout, which is the
       * pattern the API uses for the same join. Either alone would be enough
       * given the foreign keys; both together mean a mistake in one of them
       * cannot widen the query.
       */
      const rows = await sql<{ slug: string | null }[]>`
        SELECT e.slug AS slug
        FROM cv_analyses a
        JOIN workout_sets ws ON ws.id = a.workout_set_id
        JOIN workout_exercises we ON we.id = ws.workout_exercise_id
        JOIN workouts w ON w.id = we.workout_id
        JOIN exercises e ON e.id = we.exercise_id
        WHERE a.id = ${analysis.id}
          AND a.user_id = ${analysis.userId}
          AND w.user_id = ${analysis.userId}
        LIMIT 1
      `;
      return rows[0]?.slug ?? null;
    },

    async complete(analysis, result, repCount) {
      await sql`
        UPDATE cv_analyses
        SET status = 'complete', result = ${sql.json(result as never)},
            rep_count = ${repCount}, error = NULL, completed_at = now()
        WHERE id = ${analysis.id} AND user_id = ${analysis.userId}
      `;
    },

    async fail(analysis, message) {
      await sql`
        UPDATE cv_analyses
        SET status = 'failed', error = ${message}, completed_at = now()
        WHERE id = ${analysis.id} AND user_id = ${analysis.userId}
      `;
    },

    async release(analysis) {
      // `started_at` is cleared too, or the abandonment sweep would count the
      // time this attempt spent against the next one.
      await sql`
        UPDATE cv_analyses SET status = 'queued', started_at = NULL
        WHERE id = ${analysis.id} AND user_id = ${analysis.userId}
      `;
    },

    async requeueAbandoned(olderThanMs) {
      /*
       * Measured from `started_at`, not `created_at`. A row is created before
       * the video has even been uploaded, so against `created_at` this would
       * return yes for a clip claimed a second ago and a restarting worker
       * would steal work that is still running.
       *
       * `started_at IS NULL` catches rows left `processing` by a version of
       * this worker that predates the column — they cannot be timed, and a row
       * that nothing will ever look at again is worse than one retried once.
       */
      const rows = await sql`
        UPDATE cv_analyses SET status = 'queued'
        WHERE status = 'processing'
          AND (
            started_at IS NULL
            OR started_at < now() - ${`${Math.round(olderThanMs / 1000)} seconds`}::interval
          )
        RETURNING id
      `;
      return rows.length;
    },

    close: () => sql.end({ timeout: 5 }),
  };
}
