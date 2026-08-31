import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      // NFR-M-04 / §19.2: the domain module is the one place a 100% bar is
      // both achievable and worth enforcing.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
