import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Integration tests talk to a real Postgres and are slower than unit tests.
    testTimeout: 30_000,
    // Seeding 169 exercises row by row against a remote Neon branch is slow;
    // against CI's local Postgres it is not. The ceiling is set for the slower
    // of the two so a developer's run does not fail for being far from AWS.
    hookTimeout: 180_000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    /**
     * One database, one suite at a time.
     *
     * Every integration suite truncates the whole schema to start from a known
     * state (§14.3 assumes a single Postgres — a Neon branch or a CI service
     * container). Run in parallel, one file's truncate lands in the middle of
     * another's seed and the failure looks like a bug in the code under test
     * rather than in the harness. Sequential is slower and honest.
     */
    fileParallelism: false,
  },
});
