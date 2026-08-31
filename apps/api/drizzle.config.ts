import { defineConfig } from 'drizzle-kit';

/**
 * NFR-M-03: migrations are versioned, forward-only and checked in. `generate`
 * writes SQL for review — never `push`, which would let a diff run unreviewed
 * against a real database (BRD §16.4).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
