/**
 * Identifier generation. NFR-R-04: UUIDv7 everywhere, so ids sort by creation
 * time and a client can mint one offline without risking a collision.
 */
import { v7 as uuidv7, validate as validateUuid } from 'uuid';

export function newId(): string {
  return uuidv7();
}

export function isUuid(value: string): boolean {
  return validateUuid(value);
}
