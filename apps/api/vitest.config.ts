import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Integration tests talk to a real Postgres and are slower than unit tests.
    testTimeout: 20_000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
