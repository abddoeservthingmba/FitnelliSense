/**
 * Password hashing (FR-AUTH-02). argon2id, memory-hard, with parameters set
 * high enough to matter and low enough to run on a free-tier instance.
 */
import { hash, verify } from '@node-rs/argon2';

// argon2id is this library's default algorithm; the rest is the OWASP baseline.
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Never throws on a malformed stored hash — a corrupt row must read as "wrong
 * password", not as a 500 that tells an attacker the account is special.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
