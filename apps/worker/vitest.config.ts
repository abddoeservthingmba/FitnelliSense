import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /*
     * The store suite talks to a real Postgres — a Neon branch several thousand
     * miles away for a developer, a local service container in CI. The ceiling
     * is set for the slower of the two, so a developer's run does not fail for
     * being far from AWS.
     */
    testTimeout: 90_000,
    hookTimeout: 180_000,
    include: ['src/**/*.test.ts'],
    /*
     * The store suite truncates the schema to start from a known state, so it
     * cannot share a database with anything running beside it.
     */
    fileParallelism: false,
  },
});
