import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    /*
     * Integration tests talk to a real Postgres and are slower than unit tests.
     *
     * 90s, not 30s. The slowest test logs four separate sessions, and FR-WK-02
     * permits only one active workout at a time, so those round trips CANNOT be
     * parallelised — the test is bound by latency to the database, which for a
     * developer is a Neon branch several thousand miles away. At 30s it was
     * finishing in 29.8s and failing intermittently, which reads as a bug in
     * the code under test rather than as a slow network.
     */
    testTimeout: 90_000,
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
