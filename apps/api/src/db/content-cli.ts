/**
 * Content round-trip on the command line (FR-ADM-07).
 *
 *   pnpm content:export   live catalogue -> content/exercises.seed.json
 *   pnpm content:import   that file -> the database, idempotently
 *
 * The export is what makes a content edit reviewable in a pull request: run it,
 * commit the diff, and the catalogue survives any database reset (R11).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { createDatabase } from './client.js';
import { exportCatalogue, importCatalogue } from '../services/content-service.js';
import { seedFilePath } from './paths.js';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'export' && command !== 'import') {
    console.error('Usage: content-cli <export|import>');
    process.exit(2);
  }

  const handle = createDatabase(loadConfig());
  const file = seedFilePath();

  try {
    if (command === 'export') {
      const catalogue = await exportCatalogue(handle.db);
      await writeFile(file, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
      console.log(`Exported ${catalogue.exercises.length} exercises to ${file}`);
    } else {
      const catalogue: unknown = JSON.parse(await readFile(file, 'utf8'));
      console.log('Imported:', await importCatalogue(handle.db, catalogue));
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error('Content command failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
