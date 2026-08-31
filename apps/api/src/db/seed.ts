/**
 * Seed the catalogue from `content/exercises.seed.json` (BRD §16.2 task 3).
 *
 * Idempotent: it imports the same file into an empty or a populated database
 * and converges on the same state. It fails loudly rather than seeding an
 * exercise whose media has no stated licence — that check lives in the schema
 * (FR-MED-10) and this script does not bypass it.
 */
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { createDatabase } from './client.js';
import { importCatalogue } from '../services/content-service.js';
import { seedFilePath } from './paths.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = createDatabase(config);

  try {
    const file = seedFilePath();
    console.log(`Seeding from ${file}`);
    const catalogue: unknown = JSON.parse(await readFile(file, 'utf8'));
    const stats = await importCatalogue(handle.db, catalogue);
    console.log('Seed complete:', stats);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
