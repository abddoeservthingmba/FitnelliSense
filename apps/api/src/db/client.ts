/**
 * Database client. One pool per process, created from validated config.
 *
 * Neon suspends idle compute on the free tier, so the first query after a pause
 * is slow rather than broken (R1, NFR-O-07). Connection errors are surfaced as
 * SERVICE_UNAVAILABLE so the client treats them as offline (NFR-B-08).
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Config } from '../config.js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  readonly sql: postgres.Sql;
  close(): Promise<void>;
}

export function createDatabase(config: Config): DatabaseHandle {
  const sql = postgres(config.DATABASE_URL, {
    max: config.DATABASE_POOL_MAX,
    // Neon's pooler closes idle connections; keep ours shorter than theirs.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });

  return {
    db: drizzle(sql, { schema, casing: 'snake_case' }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

export { schema };
