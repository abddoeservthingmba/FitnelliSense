/**
 * Client-side UUIDv7 (NFR-R-04).
 *
 * The client mints the id for anything it creates, so a workout or a set exists
 * the moment it is logged — offline, mid-set, with no round trip. Version 7
 * puts the timestamp first, so ids sort by creation time and index well.
 */
import * as Crypto from 'expo-crypto';

const HEX = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'));

export function uuidv7(): string {
  const bytes = Crypto.getRandomBytes(16);
  const timestamp = Date.now();

  // 48 bits of Unix milliseconds, big-endian.
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp / 2 ** 24) & 0xff;
  bytes[3] = (timestamp / 2 ** 16) & 0xff;
  bytes[4] = (timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7 and the RFC 4122 variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => HEX[byte] ?? '00').join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A key for an idempotent mutation (NFR-R-03). Derived from the entity id and
 * the operation, so a replay of the same logical write carries the same key.
 */
export function idempotencyKey(operation: string, entityId: string): string {
  return `${operation}-${entityId}`;
}
