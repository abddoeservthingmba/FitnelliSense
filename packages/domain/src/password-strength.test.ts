import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, checkPassword } from './password-strength';

/** Passwords a real person would reasonably pick, which must all be accepted. */
const GOOD = [
  'correct horse battery staple',
  'wildly unrelated turnip',
  'my dog is called biscuit',
  'Tr0ubador&3xample',
  'kettlebell tuesday rain',
  'सूरज पहाड़ नदी बादल',
  '🏋️ heavy monday squats',
];

describe('length', () => {
  it('rejects anything under the floor, and says how to get there', () => {
    const problem = checkPassword('short');
    expect(problem?.code).toBe('too-short');
    expect(problem?.message).toContain(String(MIN_PASSWORD_LENGTH));
    // The message suggests a fix rather than just complaining.
    expect(problem?.message).toContain('words');
  });

  it('accepts exactly the floor', () => {
    expect(checkPassword('abcXYZ123!@#')).toBeNull();
  });
});

describe('long but guessable', () => {
  it('rejects a single character repeated', () => {
    expect(checkPassword('aaaaaaaaaaaa')?.code).toBe('repeated');
    expect(checkPassword('111111111111')?.code).toBe('repeated');
  });

  it('rejects a short unit tiled to length', () => {
    // Each of these clears twelve characters and is worth nothing.
    expect(checkPassword('abcabcabcabc')?.code).toBe('repeated');
    expect(checkPassword('12341234123412341234')?.code).toBe('repeated');
    expect(checkPassword('passwordpassword')?.code).toBe('repeated');
  });

  it('rejects a straight run along the keyboard or alphabet', () => {
    expect(checkPassword('abcdefghijklm')?.code).toBe('sequence');
    expect(checkPassword('qwertyuiop')?.code).toBe('too-short'); // caught by length first
    expect(checkPassword('mnopqrstuvwxyz')?.code).toBe('sequence');
  });

  it('rejects a run typed backwards', () => {
    expect(checkPassword('zyxwvutsrqpo')?.code).toBe('sequence');
  });

  it('rejects known long breach entries', () => {
    // Not a tiled repeat and not a clean keyboard run, so this one is caught
    // by the breach list rather than by a pattern rule.
    expect(checkPassword('123456789012')?.code).toBe('common');
    // Whereas this one is 'iloveyou' twice, so the pattern rule gets it first.
    expect(checkPassword('iloveyouiloveyou')?.code).toBe('repeated');
    expect(checkPassword('thisismypassword')?.code).toBe('common');
    expect(checkPassword('fitnessintellisense')?.code).toBe('common');
  });

  it('is case-insensitive about all of it', () => {
    expect(checkPassword('PasswordPassword')?.code).toBe('repeated');
    expect(checkPassword('ThisIsMyPassword')?.code).toBe('common');
  });
});

describe('identity', () => {
  const identity = ['sam.carter@example.com', 'Sam Carter'];

  it("rejects a password built from the user's own email", () => {
    expect(checkPassword('sam.carter1234', identity)?.code).toBe('contains-identity');
  });

  it('rejects the display name embedded in it', () => {
    expect(checkPassword('xxSam CarterXX', identity)?.code).toBe('contains-identity');
  });

  it('matches the local part rather than the whole address', () => {
    // A password containing the domain only is not the giveaway.
    expect(checkPassword('example wildly turnip', identity)).toBeNull();
  });

  it('ignores identity fragments too short to be meaningful', () => {
    // A three-letter name would otherwise reject half the dictionary.
    expect(checkPassword('a proper long passphrase', ['abc@example.com', 'Abc'])).toBeNull();
  });

  it('checks nothing when no identity is supplied', () => {
    expect(checkPassword('sam.carter1234')).toBeNull();
  });
});

describe('passwords real people pick', () => {
  it('accepts all of them', () => {
    for (const password of GOOD) {
      expect(checkPassword(password, ['sam@example.com', 'Sam']), password).toBeNull();
    }
  });

  it('does not punish length', () => {
    // A long passphrase must never be rejected for being long.
    const long = 'a rather long passphrase about nothing in particular at all';
    expect(checkPassword(long)).toBeNull();
  });

  it('reports only the first problem, not a lecture', () => {
    // 'aaaa' repeated is both repeated and arguably a sequence; one answer.
    const problem = checkPassword('aaaaaaaaaaaa');
    expect(problem).not.toBeNull();
    expect(Object.keys(problem ?? {})).toEqual(['code', 'message']);
  });
});
