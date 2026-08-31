/**
 * Opaque cursors (BRD §10.2).
 *
 * A cursor is base64url over the sort key of the last row returned. Opaque
 * because the shape is ours to change; keyset-based because OFFSET on a growing
 * history gets slower every week.
 */
import { badRequest } from './errors.js';

export function encodeCursor(parts: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): (string | number)[] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed as (string | number)[];
  } catch {
    throw badRequest('That page cursor is not valid');
  }
}

/**
 * Fetches one row more than asked for, so "is there another page" needs no
 * count query.
 */
export function takePage<T>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => string,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: [...rows], nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: last === undefined ? null : cursorOf(last) };
}
