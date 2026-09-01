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

  /**
   * The migration runner resolves its folder relative to its own file, so the
   * SQL has to travel with the bundle: in `src` it sits beside `migrate.ts`,
   * and in `dist` it must sit beside `migrate.js`. Without this the deployed
   * build finds an empty folder and applies nothing — which fails loudly here,
   * but would be far worse if it failed quietly.
   */
  async onSuccess() {
    const { cp } = await import('node:fs/promises');
    await cp('src/db/migrations', 'dist/migrations', { recursive: true });
    console.log('Copied migrations into dist/migrations');

    // The privacy policy is read from disk at boot and served at /privacy.
    // tsup bundles JavaScript only, so without this the deployed process
    // throws on startup — loudly, which is the right failure for a
    // deployment that cannot serve its own privacy policy.
    await cp('../../docs/privacy-policy.md', 'dist/docs/privacy-policy.md');
    console.log('Copied privacy-policy.md into dist/docs');
  },
});
