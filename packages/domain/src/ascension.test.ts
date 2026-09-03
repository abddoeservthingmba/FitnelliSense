import { describe, expect, it } from 'vitest';
import { RANK_THRESHOLDS, rankForLevel, type Rank } from './hunter';
import {
  DEFAULT_ASCENSION,
  MOTIFS,
  badgeName,
  ASCENSIONS,
  ASCENSION_IDS,
  isAscensionId,
  ascensionFor,
  ascensionLadder,
  nextTier,
  tierForLevel,
  tierForRank,
} from './ascension';

const ALL_RANKS: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Perceptual distance (CIE76 ΔE), for "can you tell these two apart".
 *
 * WCAG contrast is the wrong tool for that question: it compares luminance
 * only, so gold and pale blue score 1.08 — nearly identical — while being
 * obviously different colours. Text on a background needs luminance; two
 * accents beside each other need hue, which means Lab.
 */
function deltaE(a: string, b: string): number {
  const lab = (hex: string): [number, number, number] => {
    const linear = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];

    // sRGB to XYZ (D65), then XYZ to Lab.
    const x = (0.4124 * linear[0] + 0.3576 * linear[1] + 0.1805 * linear[2]) / 0.95047;
    const y = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    const z = (0.0193 * linear[0] + 0.1192 * linear[1] + 0.9505 * linear[2]) / 1.08883;

    const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };

  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe('the Ascensions themselves', () => {
  it('offers every id it lists', () => {
    for (const id of ASCENSION_IDS) expect(ASCENSIONS[id].id).toBe(id);
  });

  it('defaults to the original ladder, so existing accounts look unchanged', () => {
    expect(DEFAULT_ASCENSION).toBe('monarch');
    expect(ASCENSIONS.monarch.palette.accent).toBe('#8CC8FF');
  });

  /*
   * THE INVARIANT. An Ascension decorates the ladder; it must not be able to alter
   * it. Six tiers, one per rank, no duplicates, for every Ascension — so no Ascension
   * can level faster, and two users' levels stay comparable no matter what
   * they picked.
   */
  it('gives every Ascension exactly one tier per rank', () => {
    for (const id of ASCENSION_IDS) {
      const ascension = ASCENSIONS[id];
      expect(ascension.tiers).toHaveLength(RANK_THRESHOLDS.length);
      expect(ascension.tiers.map((tier) => tier.rank)).toEqual(ALL_RANKS);
    }
  });

  it('names every tier and every Ascension distinctly within itself', () => {
    for (const id of ASCENSION_IDS) {
      const ascension = ASCENSIONS[id];
      const names = ascension.tiers.map((tier) => tier.name);
      expect(new Set(names).size).toBe(names.length);
      for (const tier of ascension.tiers) {
        expect(tier.name.length).toBeGreaterThan(0);
        expect(tier.blurb.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every Ascension its own identity in the picker', () => {
    const names = ASCENSION_IDS.map((id) => ASCENSIONS[id].name);
    expect(new Set(names).size).toBe(names.length);
    const accents = ASCENSION_IDS.map((id) => ASCENSIONS[id].palette.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('uses well-formed hex for every colour', () => {
    for (const id of ASCENSION_IDS) {
      for (const [key, value] of Object.entries(ASCENSIONS[id].palette)) {
        expect(value, `${id}.${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  /*
   * Contrast is checked here rather than trusted, because an Ascension is five more
   * chances to ship something unreadable. The accent sits on the Ascension's own
   * background and carries text on top of it, so both directions matter.
   */
  it('keeps every accent legible on its own background', () => {
    for (const id of ASCENSION_IDS) {
      const { accent, background } = ASCENSIONS[id].palette;
      // 4.5:1 is AA for body text; an accent is used for text as well as fills.
      expect(contrast(accent, background), `${id} accent on background`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps text legible on top of every accent fill', () => {
    for (const id of ASCENSION_IDS) {
      const { accent, accentText } = ASCENSIONS[id].palette;
      expect(contrast(accentText, accent), `${id} accentText on accent`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps the highlight legible, and distinct from the accent', () => {
    for (const id of ASCENSION_IDS) {
      const { highlight, accent, background } = ASCENSIONS[id].palette;
      expect(contrast(highlight, background), `${id} highlight`).toBeGreaterThanOrEqual(4.5);
      // Records use the highlight and ranks use the accent, so they have to be
      // tellable apart. Measured perceptually, not by luminance: the monarch
      // pair is gold against pale blue, which differ by hue almost entirely
      // and score 1.08 on contrast while being unmistakable on screen.
      // ΔE above 20 is "different colour" to anyone looking.
      expect(deltaE(highlight, accent), `${id} highlight vs accent`).toBeGreaterThan(20);
    }
  });

  it('keeps surfaces distinguishable from the background', () => {
    for (const id of ASCENSION_IDS) {
      const { background, surface, surfaceRaised } = ASCENSIONS[id].palette;
      expect(background).not.toBe(surface);
      expect(surface).not.toBe(surfaceRaised);
      expect(luminance(surfaceRaised), `${id} raised above surface`).toBeGreaterThan(
        luminance(background),
      );
    }
  });
});

describe('ascensionFor', () => {
  it('finds an Ascension by id', () => {
    expect(ascensionFor('saiyan').id).toBe('saiyan');
  });

  it('falls back to the default rather than throwing', () => {
    // A profile written by an older client, or a row edited by hand. A missing
    // Ascension must never be able to break a render.
    expect(ascensionFor(null).id).toBe(DEFAULT_ASCENSION);
    expect(ascensionFor(undefined).id).toBe(DEFAULT_ASCENSION);
    expect(ascensionFor('nonsense').id).toBe(DEFAULT_ASCENSION);
    expect(ascensionFor('').id).toBe(DEFAULT_ASCENSION);
  });
});

describe('isAscensionId', () => {
  it('accepts the real ones and rejects everything else', () => {
    expect(isAscensionId('pirate')).toBe(true);
    expect(isAscensionId('hokage')).toBe(false);
  });
});

describe('tierForRank and tierForLevel', () => {
  it('renders the rank the ladder gives, on the chosen Ascension', () => {
    const ascension = ASCENSIONS.shinobi;
    expect(tierForRank(ascension, 'E').name).toBe('Academy Student');
    expect(tierForRank(ascension, 'S').name).toBe('Hokage');
  });

  it('agrees with the underlying rank at every level tested', () => {
    // The point of the whole design: the Ascension is a lookup, never a second
    // opinion about what rank you are.
    for (const id of ASCENSION_IDS) {
      const ascension = ASCENSIONS[id];
      for (const level of [1, 9, 10, 19, 20, 34, 35, 54, 55, 79, 80, 200]) {
        expect(tierForLevel(ascension, level).rank).toBe(rankForLevel(level));
      }
    }
  });

  it('puts level 1 at the bottom tier and the top threshold at the top', () => {
    const top = RANK_THRESHOLDS[0] as { rank: Rank; minLevel: number };
    for (const id of ASCENSION_IDS) {
      const ascension = ASCENSIONS[id];
      expect(tierForLevel(ascension, 1)).toBe(ascension.tiers[0]);
      expect(tierForLevel(ascension, top.minLevel)).toBe(ascension.tiers[5]);
    }
  });
});

describe('nextTier', () => {
  it('points at the next one up, with the level it starts at', () => {
    const next = nextTier(ASCENSIONS.pirate, 1);
    expect(next?.tier.name).toBe('Supernova');
    expect(next?.atLevel).toBe(10);
  });

  it('is null at the top, because there is nothing above it', () => {
    expect(nextTier(ASCENSIONS.pirate, 80)).toBeNull();
    expect(nextTier(ASCENSIONS.pirate, 999)).toBeNull();
  });

  it('never points at the tier you are already on', () => {
    for (const id of ASCENSION_IDS) {
      const ascension = ASCENSIONS[id];
      for (const level of [1, 10, 20, 35, 55]) {
        const next = nextTier(ascension, level);
        expect(next?.tier.rank).not.toBe(rankForLevel(level));
      }
    }
  });
});

describe('ascensionLadder', () => {
  it('lists all six with their unlock levels, ascending', () => {
    const ladder = ascensionLadder(ASCENSIONS.shinigami);
    expect(ladder).toHaveLength(6);
    expect(ladder[0]).toEqual({ tier: ASCENSIONS.shinigami.tiers[0], atLevel: 1 });
    expect(ladder[5]?.atLevel).toBe(80);
    expect(ladder.map((step) => step.atLevel)).toEqual([1, 10, 20, 35, 55, 80]);
  });

  it('gives the same unlock levels on every Ascension', () => {
    // If this ever differs, an Ascension has changed the ladder.
    const reference = ascensionLadder(ASCENSIONS.monarch).map((step) => step.atLevel);
    for (const id of ASCENSION_IDS) {
      expect(
        ascensionLadder(ASCENSIONS[id]).map((step) => step.atLevel),
        id,
      ).toEqual(reference);
    }
  });
});

describe('tier forms', () => {
  it('gives every tier a well-formed mark', () => {
    for (const id of ASCENSION_IDS) {
      for (const tier of ASCENSIONS[id].tiers) {
        const { colour, crest, reach, aura } = tier.form;
        expect(colour, `${id}.${tier.rank}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(Number.isInteger(crest)).toBe(true);
        expect(crest).toBeGreaterThanOrEqual(0);
        // The renderer fans the crest across the head; beyond about a dozen
        // the elements overlap into a solid block.
        expect(crest).toBeLessThanOrEqual(12);
        expect(reach).toBeGreaterThan(0);
        // reach is a fraction of the radius; above 1 the crest leaves the box.
        expect(reach).toBeLessThanOrEqual(1);
        expect([0, 1, 2, 3]).toContain(aura);
      }
    }
  });

  it('gives every Ascension a motif', () => {
    for (const id of ASCENSION_IDS) {
      expect(MOTIFS).toContain(ASCENSIONS[id].motif);
    }
  });

  /*
   * The marks have to read as one thing escalating, not six unrelated badges.
   *
   * Measured as reach PLUS aura, not reach alone. Reach on its own is not
   * monotonic and should not be: the Saiyan's fifth form is the long-haired
   * one and its sixth is deliberately short and silver, so demanding
   * ever-growing hair would force a mark that is less recognisable, not more.
   * A later form can be smaller as long as it is unmistakably more powerful,
   * which is what the aura rings carry.
   */
  it('escalates presence up every ladder', () => {
    const presence = (form: { reach: number; aura: number }) => form.reach + form.aura;

    for (const id of ASCENSION_IDS) {
      const scores = ASCENSIONS[id].tiers.map((tier) => presence(tier.form));
      for (let i = 1; i < scores.length; i += 1) {
        expect(scores[i] as number, `${id} tier ${i} vs ${i - 1}`).toBeGreaterThan(
          scores[i - 1] as number,
        );
      }
    }
  });

  it('draws no two tiers of an Ascension identically', () => {
    for (const id of ASCENSION_IDS) {
      const shapes = ASCENSIONS[id].tiers.map(
        (tier) => `${tier.form.crest}:${tier.form.reach}:${tier.form.aura}`,
      );
      expect(new Set(shapes).size, id).toBe(shapes.length);
    }
  });

  it('reaches its peak aura only at the top of the ladder', () => {
    for (const id of ASCENSION_IDS) {
      const auras = ASCENSIONS[id].tiers.map((tier) => tier.form.aura);
      expect(Math.max(...auras), id).toBe(auras[auras.length - 1]);
      expect(auras[0], `${id} starts bare`).toBe(0);
    }
  });

  it('does not reuse one colour for two tiers of the same Ascension', () => {
    for (const id of ASCENSION_IDS) {
      const colours = ASCENSIONS[id].tiers.map((tier) => tier.form.colour);
      expect(new Set(colours).size, id).toBe(colours.length);
    }
  });
});

describe('badgeName', () => {
  it('renames a rank badge to the tier it marks', () => {
    // The bug this fixes: someone on the Saiyan path earned "Super Saiyan" as
    // a tier and was handed a badge for becoming a C-Rank Hunter.
    expect(badgeName(ASCENSIONS.saiyan, 'rank_c', 'C-Rank Hunter')).toBe('Super Saiyan');
    expect(badgeName(ASCENSIONS.shinobi, 'rank_s', 'S-Rank Hunter')).toBe('Hokage');
    expect(badgeName(ASCENSIONS.hero, 'rank_a', 'A-Rank Hunter')).toBe('Serious');
  });

  it('covers every rank badge', () => {
    for (const [key, rank] of [
      ['rank_d', 'D'],
      ['rank_c', 'C'],
      ['rank_b', 'B'],
      ['rank_a', 'A'],
      ['rank_s', 'S'],
    ] as const) {
      for (const id of ASCENSION_IDS) {
        expect(badgeName(ASCENSIONS[id], key, 'fallback')).toBe(
          tierForRank(ASCENSIONS[id], rank).name,
        );
      }
    }
  });

  it('leaves badges that describe the work rather than the world', () => {
    // "Centurion" and "One Tonne" are about what was done, not which universe
    // it was done in. Translating them per Ascension would be invention.
    for (const key of ['first_workout', 'centurion', 'one_tonne', 'unbroken']) {
      expect(badgeName(ASCENSIONS.pirate, key, 'Centurion')).toBe('Centurion');
    }
  });

  it('falls back for a key it has never heard of', () => {
    // A badge added by a newer server than this client knows about.
    expect(badgeName(ASCENSIONS.monarch, 'some_future_badge', 'Future')).toBe('Future');
  });
});
