/**
 * One-time codes.
 *
 * A six-digit code is the weakest credential in the system, so the properties
 * worth pinning down are the ones that stop it being weaker than it looks:
 * every code is exactly six digits (a leading zero must survive), codes are
 * not predictable, and the stored form is not the code.
 */
import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, MAX_ATTEMPTS, generateCode, hashCode, normaliseCode } from '../src/lib/otp';
import { hashRefreshToken } from '../src/lib/tokens';

const tokens = {
  accessSecret: 'a'.repeat(32),
  refreshPepper: 'pepper-that-is-long-enough-to-use',
  accessTtlSecs: 900,
  refreshTtlSecs: 2_592_000,
};

describe('generateCode', () => {
  it('is always exactly six digits, including when it starts with zero', () => {
    for (let index = 0; index < 2000; index += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('covers the whole range, low values included', () => {
    // `padStart` is the only thing keeping "42" from being a two-character
    // code, and a generator that never produced a small number would hide a
    // broken pad. Over 20k draws a value below 100000 is a near-certainty.
    const codes = Array.from({ length: 20_000 }, () => generateCode());
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
    expect(codes.every((code) => code.length === CODE_LENGTH)).toBe(true);
  });

  it('does not repeat itself in a way a guesser could exploit', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateCode()));
    // Birthday collisions in 10^6 are expected at this sample size; a
    // generator stuck in a small cycle is what this rules out.
    expect(codes.size).toBeGreaterThan(950);
  });
});

describe('hashCode', () => {
  it('does not store the code', () => {
    const code = '123456';
    const hash = hashCode(tokens, code);
    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same code and differs for another', () => {
    expect(hashCode(tokens, '123456')).toBe(hashCode(tokens, '123456'));
    expect(hashCode(tokens, '123456')).not.toBe(hashCode(tokens, '123457'));
  });

  it('depends on the pepper, so a leaked table alone is not enough', () => {
    const other = { ...tokens, refreshPepper: 'a-completely-different-pepper-value' };
    expect(hashCode(tokens, '123456')).not.toBe(hashCode(other, '123456'));
  });

  it('is domain-separated from refresh tokens', () => {
    // Both are peppered with the same secret. A code and a refresh token that
    // happened to share a string must not produce the same hash, or one
    // table's rows could be replayed against the other.
    expect(hashCode(tokens, '123456')).not.toBe(hashRefreshToken(tokens, '123456'));
  });
});

describe('normaliseCode', () => {
  it('accepts a code the way an email hands it over', () => {
    expect(normaliseCode('123 456')).toBe('123456');
    expect(normaliseCode('123-456')).toBe('123456');
    expect(normaliseCode(' 123456 ')).toBe('123456');
  });

  it('leaves anything else alone, so it is rejected rather than mangled', () => {
    expect(normaliseCode('12a456')).toBe('12a456');
  });
});

describe('MAX_ATTEMPTS', () => {
  it('bounds brute force to well under the code space', () => {
    // 10^6 / MAX_ATTEMPTS requests per issued code, and codes expire.
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(MAX_ATTEMPTS).toBeLessThan(20);
  });
});
