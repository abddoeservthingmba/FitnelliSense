import { defineConfig } from 'tsup';

/**
 * The workspace packages ship TypeScript source, so the deployed artefact is a
 * bundle rather than a tsc output tree: `@fi/shared` and `@fi/domain` are
 * compiled in, and node_modules stays external.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/db/migrate.ts',
    seed: 'src/db/seed.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@fi\//],
});
