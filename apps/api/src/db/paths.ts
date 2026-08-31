/** Repository paths the CLI scripts share. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from this file to the repository root, which holds `content/`. */
export function seedFilePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../..', 'content/exercises.seed.json');
}
