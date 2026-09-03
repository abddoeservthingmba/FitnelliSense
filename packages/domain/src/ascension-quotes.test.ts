import { describe, expect, it } from 'vitest';
import { ASCENSION_IDS, DEFAULT_ASCENSION } from './ascension';
import { quoteFor, quotesFor, type QuoteContext } from './ascension-quotes';

const CONTEXTS: QuoteContext[] = ['home', 'training', 'finish', 'insights', 'return'];

describe('the quote pools', () => {
  it('covers every context for every Ascension', () => {
    // A missing pool would fall back silently and show another character's
    // voice, which is worse than showing nothing.
    for (const id of ASCENSION_IDS) {
      const pool = quotesFor(id);
      for (const context of CONTEXTS) {
        expect(pool[context], `${id}.${context}`).toBeDefined();
        expect(pool[context].length, `${id}.${context}`).toBeGreaterThan(0);
      }
    }
  });

  it('writes every line as a non-empty single line', () => {
    for (const id of ASCENSION_IDS) {
      for (const context of CONTEXTS) {
        for (const line of quotesFor(id)[context]) {
          expect(line.trim()).toBe(line);
          expect(line.length).toBeGreaterThan(0);
          expect(line).not.toContain('\n');
        }
      }
    }
  });

  it('keeps mid-session lines short enough to read between sets', () => {
    // Nobody reads a paragraph with a bar on their back.
    for (const id of ASCENSION_IDS) {
      for (const line of quotesFor(id).training) {
        expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(64);
      }
    }
  });

  it('gives each Ascension its own words', () => {
    // Shared lines would undo the point of choosing a character.
    const seen = new Map<string, string>();
    for (const id of ASCENSION_IDS) {
      for (const context of CONTEXTS) {
        for (const line of quotesFor(id)[context]) {
          const previous = seen.get(line);
          expect(previous, `"${line}" appears in both ${previous} and ${id}`).toBeUndefined();
          seen.set(line, id);
        }
      }
    }
  });
});

describe('quoteFor', () => {
  it('returns the same line for the same seed', () => {
    // The property the whole design rests on: text that changes while being
    // read is a distraction, not encouragement.
    const first = quoteFor('saiyan', 'home', '2026-09-03');
    for (let i = 0; i < 20; i += 1) {
      expect(quoteFor('saiyan', 'home', '2026-09-03')).toBe(first);
    }
  });

  it('varies across seeds', () => {
    const lines = new Set(
      Array.from({ length: 40 }, (_, index) => quoteFor('monarch', 'home', `day-${index}`)),
    );
    expect(lines.size).toBeGreaterThan(1);
  });

  it('always returns a line that is actually in the pool', () => {
    for (const id of ASCENSION_IDS) {
      for (const context of CONTEXTS) {
        for (let seed = 0; seed < 30; seed += 1) {
          const line = quoteFor(id, context, `s${seed}`);
          expect(quotesFor(id)[context]).toContain(line);
        }
      }
    }
  });

  it('falls back to the default for an unknown Ascension', () => {
    // A profile written by a newer client, or a hand-edited row.
    const line = quoteFor('nonsense', 'home', 'x');
    expect(quotesFor(DEFAULT_ASCENSION).home).toContain(line);
  });

  it('never produces a negative index, whatever the seed', () => {
    // The hash is 32-bit and `Math.imul` returns a signed result, so without
    // the unsigned shift some seeds would index before the start of the array
    // and return undefined.
    for (const seed of ['', 'a', 'ÿÿÿÿ', '\u{1F600}', 'x'.repeat(500), '2026-09-03T10:00']) {
      const line = quoteFor('pirate', 'training', seed);
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe('quotesFor', () => {
  it('returns the pool for a known Ascension', () => {
    expect(quotesFor('shinobi').home.length).toBeGreaterThan(0);
  });

  it('falls back for an unknown one', () => {
    expect(quotesFor('nope')).toBe(quotesFor(DEFAULT_ASCENSION));
  });
});
