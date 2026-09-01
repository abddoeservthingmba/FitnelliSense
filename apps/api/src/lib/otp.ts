/**
 * One-time codes for email verification and password reset (FR-AUTH-06).
 *
 * A six-digit code is a deliberate weakening compared to the 256-bit token it
 * replaces, chosen because a code someone can read off their email and type
 * into the app is the flow that actually works on a phone — a reset *link* has
 * to escape the mail client, open a browser, and deep-link back into the app.
 *
 * The weakening is paid for, not ignored:
 *   - the code is only ever looked up alongside the email address, so the
 *     search space is 10^6 per account rather than shared across all accounts;
 *   - every code carries an attempt counter and dies at `MAX_ATTEMPTS`;
 *   - codes are short-lived (`otpTtlSecs`), and requesting a new one retires
 *     the previous one;
 *   - the endpoints sit behind the same per-address rate limit as login.
 *
 * Codes are stored as a peppered hash, exactly like refresh tokens: a database
 * leak must not hand over a usable password reset. With only 10^6 preimages a
 * plain hash would be trivially reversible, which is why the pepper — held
 * outside the database — is what makes the hash worth anything here.
 */
import { randomInt } from 'node:crypto';
import { hashRefreshToken, type TokenConfig } from './tokens';

/** Six digits, matching what people expect to be asked for. */
export const CODE_LENGTH = 6;

/**
 * Wrong guesses allowed before the code is spent.
 *
 * Five is enough for a genuine typo or a stale code from an earlier email, and
 * turns the brute-force cost into 10^6/5 requests per issued code.
 */
export const MAX_ATTEMPTS = 5;

/**
 * `randomInt` and not `Math.random`: this is a credential. It is also unbiased
 * across the range, which the usual `floor(random * n)` on a 32-bit source is
 * not quite.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/**
 * Codes are peppered with the same secret as refresh tokens. They live in a
 * different table with a different purpose, so there is no ambiguity about what
 * a given hash unlocks.
 */
export function hashCode(config: TokenConfig, code: string): string {
  return hashRefreshToken(config, `otp:${code}`);
}

/** Strips the spaces and dashes people paste in from an email. */
export function normaliseCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}
