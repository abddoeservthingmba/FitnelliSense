/**
 * Migration runner (NFR-M-03, NFR-D-03). Forward-only: it applies whatever is
 * in `src/db/migrations` and nothing else. Run against staging first (§11.2).
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { createDatabase } from './client.js';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = createDatabase(config);
  try {
    console.log(`Applying migrations from ${migrationsFolder}`);
    await migrate(handle.db, { migrationsFolder });
    console.log('Migrations applied.');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
