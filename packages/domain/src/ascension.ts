/**
 * Ascensions — the same ladder, told six different ways.
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE: an Ascension changes nothing but
 * words and colour. Every threshold, every XP award, every stat and every
 * rank boundary is identical whichever Ascension you pick. `Rank` stays E..S
 * internally, in the database and on the wire; an Ascension is a lookup from that
 * rank to a name.
 *
 * This is what makes the feature safe. If an Ascension could alter a threshold, two
 * users' levels would stop being comparable, the leaderboard would become
 * nonsense, and someone would pick the Ascension that levels fastest rather than
 * the one they like. So the tier list is exactly six entries — one per rank —
 * and a test asserts that for every Ascension.
 *
 * It also means the names are data. Swapping a tier list is a one-file change
 * that touches no logic, which matters because these particular names are
 * placeholders for testing and will have to be replaced with original ones
 * before the app is published.
 */
import type { Rank } from './hunter';
import { RANK_MIN_LEVEL, RANK_THRESHOLDS, rankForLevel } from './hunter';

export type AscensionId = 'monarch' | 'saiyan' | 'shinobi' | 'shinigami' | 'pirate';

/** Every Ascension a profile may hold. The default is first. */
export const ASCENSION_IDS: readonly AscensionId[] = [
  'monarch',
  'saiyan',
  'shinobi',
  'shinigami',
  'pirate',
];

export const DEFAULT_ASCENSION: AscensionId = 'monarch';

/**
 * How a tier's mark is drawn.
 *
 * Geometry and colour, not artwork. The client renders a silhouette from these
 * numbers, so thirty distinct icons come from thirty rows of data rather than
 * thirty image files — nothing to download, nothing to scale, and it recolours
 * with the palette.
 *
 * It escalates deliberately: as the rank climbs the crest gains elements,
 * reaches further and picks up aura rings, so the mark reads as a later form of
 * the same thing rather than a different badge.
 */
export interface TierForm {
  /** The crest's colour at this tier — the part that reads first. */
  readonly colour: string;
  /** Crest elements: hair spikes, horns, crown points, hat bands. */
  readonly crest: number;
  /** How far the crest extends, as a fraction of the radius. */
  readonly reach: number;
  /** Aura rings behind the mark, 0 to 3. */
  readonly aura: number;
}

/** The silhouette family a whole Ascension is drawn in. */
export type Motif = 'spike' | 'horn' | 'crown' | 'brim' | 'band';

export interface AscensionTier {
  /** The internal rank this tier renders. Never shown raw once an Ascension is set. */
  readonly rank: Rank;
  readonly name: string;
  /** One line, shown when the tier is reached. */
  readonly blurb: string;
  readonly form: TierForm;
}

/**
 * The colours an Ascension overrides.
 *
 * Deliberately only the accents. Background, surfaces and text stay put: they
 * carry the contrast guarantees (NFR-U-04), and re-deriving a readable text
 * colour per Ascension is five chances to ship something illegible. The Ascension gets
 * to change the personality, not the readability.
 */
export interface AscensionPalette {
  readonly accent: string;
  readonly accentText: string;
  readonly accentSoft: string;
  readonly highlight: string;
  readonly monarch: string;
  readonly monarchSoft: string;
  /** A hint of the Ascension in the darkest surface, so it is not only the accent. */
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly track: string;
}

export interface Ascension {
  readonly id: AscensionId;
  /** Shown in the picker. */
  readonly name: string;
  /** What this Ascension calls the whole progression, replacing "the System". */
  readonly systemLabel: string;
  /** What it calls a level, e.g. "Power Level". */
  readonly levelWord: string;
  /** One sentence in the picker. */
  readonly tagline: string;
  /** The silhouette family every tier of this Ascension is drawn in. */
  readonly motif: Motif;
  /** Exactly six, ascending E to S. Derived from `byRank`, never beside it. */
  readonly tiers: readonly AscensionTier[];
  /**
   * The same six, keyed by rank.
   *
   * A total record, so `tierForRank` is a lookup that cannot miss. The
   * alternative — searching the array and falling back — is a branch that can
   * never fire and therefore can never be tested.
   */
  readonly byRank: Readonly<Record<Rank, AscensionTier>>;
  readonly palette: AscensionPalette;
}

/** A tier as written in an Ascension: name, one line, and how it is drawn. */
type TierSpec = readonly [name: string, blurb: string, form: TierForm];

/** Shorthand so a tier row stays readable at a glance. */
function form(colour: string, crest: number, reach: number, aura: number): TierForm {
  return { colour, crest, reach, aura };
}

/**
 * Builds both views of an Ascension's six tiers from one six-tuple.
 *
 * The tuple type is what guarantees six. Writing every rank out explicitly is
 * what makes the record total — TypeScript rejects an Ascension that omits one, so
 * the invariant is enforced at compile time as well as by a test.
 */
function ladderOf(
  specs: readonly [TierSpec, TierSpec, TierSpec, TierSpec, TierSpec, TierSpec],
): Pick<Ascension, 'tiers' | 'byRank'> {
  const [e, d, c, b, a, s] = specs;
  const tier = (rank: Rank, spec: TierSpec): AscensionTier => ({
    rank,
    name: spec[0],
    blurb: spec[1],
    form: spec[2],
  });

  const byRank = {
    E: tier('E', e),
    D: tier('D', d),
    C: tier('C', c),
    B: tier('B', b),
    A: tier('A', a),
    S: tier('S', s),
  } as const;

  return { byRank, tiers: [byRank.E, byRank.D, byRank.C, byRank.B, byRank.A, byRank.S] };
}

export const ASCENSIONS: Readonly<Record<AscensionId, Ascension>> = {
  /**
   * The original ladder, kept as the default so an existing account looks
   * exactly as it did before Ascensions existed.
   */
  monarch: {
    id: 'monarch',
    name: 'The Monarch',
    systemLabel: 'The System',
    levelWord: 'Level',
    tagline: 'A nobody who kept clearing gates until the world had to rank him.',
    motif: 'crown' as const,
    ...ladderOf([
      ['E-Rank Hunter', 'Everyone starts at the bottom of the list.', form('#6E88AD', 2, 0.3, 0)],
      ['Awakened', 'Something in you answered.', form('#8CC8FF', 3, 0.4, 1)],
      ['Elite Hunter', 'They stopped putting you in the easy gates.', form('#A9D8FF', 4, 0.48, 1)],
      ['National Level', 'A country counts you as an asset.', form('#F5C25B', 5, 0.56, 2)],
      ['Shadow Sovereign', 'The army follows without being asked.', form('#A970FF', 6, 0.66, 3)],
      ['Monarch', 'There is nothing above this.', form('#C9A0FF', 7, 0.78, 3)],
    ]),
    palette: {
      accent: '#8CC8FF',
      accentText: '#04101F',
      accentSoft: '#0E2748',
      highlight: '#F5C25B',
      monarch: '#A970FF',
      monarchSoft: '#1E1233',
      background: '#050D1F',
      surface: '#0A1830',
      surfaceRaised: '#122745',
      border: '#16294A',
      borderStrong: '#27436E',
      track: '#132844',
    },
  },

  saiyan: {
    id: 'saiyan',
    name: 'The Saiyan',
    systemLabel: 'The Scouter',
    levelWord: 'Power Level',
    tagline: 'Every ceiling was temporary. Train, break, recover, repeat.',
    motif: 'spike' as const,
    ...ladderOf([
      ['Base Form', 'Nothing wrong with the basics.', form('#2E2A28', 4, 0.32, 0)],
      ['Kaioken', 'More output than the body wants to give.', form('#FF5252', 4, 0.4, 1)],
      ['Super Saiyan', 'The first wall came down.', form('#FFD34D', 6, 0.56, 1)],
      ['Ascended', 'Holding the form takes no effort now.', form('#FFE066', 7, 0.66, 2)],
      ['Beyond Ascended', 'Power without the noise.', form('#FFEE99', 9, 0.92, 2)],
      ['Ultra Instinct', 'The body moves before you decide to.', form('#CFE8FF', 6, 0.62, 3)],
    ]),
    palette: {
      accent: '#FFB33C',
      accentText: '#1A0E00',
      accentSoft: '#3A2200',
      highlight: '#FFE066',
      monarch: '#4FA8FF',
      monarchSoft: '#0B2338',
      background: '#150B02',
      surface: '#231206',
      surfaceRaised: '#33200F',
      border: '#3D2612',
      borderStrong: '#61411F',
      track: '#33200F',
    },
  },

  shinobi: {
    id: 'shinobi',
    name: 'The Shinobi',
    systemLabel: 'The Village',
    levelWord: 'Rank',
    tagline: 'Last in the class. Refused to stay there.',
    motif: 'band' as const,
    ...ladderOf([
      ['Academy Student', 'Still failing the basic technique.', form('#8A93A5', 1, 0.28, 0)],
      ['Genin', 'Assigned a squad and a headband.', form('#4A90D9', 2, 0.36, 0)],
      ['Chunin', 'Trusted to lead a mission.', form('#4BAE6A', 3, 0.44, 1)],
      ['Jonin', 'The one they send when it matters.', form('#2C5C8F', 4, 0.52, 1)],
      ['Sannin', 'A name spoken in other villages.', form('#8E5FC0', 5, 0.6, 2)],
      ['Hokage', 'The whole village is behind you.', form('#FF6B35', 6, 0.72, 3)],
    ]),
    palette: {
      accent: '#FF8C42',
      accentText: '#1A0800',
      accentSoft: '#3A1A08',
      highlight: '#FFD166',
      monarch: '#7DD3FC',
      monarchSoft: '#0B2A38',
      background: '#0C0F1A',
      surface: '#151A2B',
      surfaceRaised: '#1F2740',
      border: '#252E48',
      borderStrong: '#3C4A6E',
      track: '#1F2740',
    },
  },

  shinigami: {
    id: 'shinigami',
    name: 'The Shinigami',
    systemLabel: 'The Gotei',
    levelWord: 'Reiatsu',
    tagline: 'Borrowed power, then earned every bit of it twice over.',
    motif: 'horn' as const,
    ...ladderOf([
      ['Substitute', 'The badge is not official.', form('#E8E8F0', 0, 0.3, 0)],
      ['Shinigami', 'The blade answers to you.', form('#DCDCE8', 2, 0.38, 0)],
      ['Visored', 'You made peace with the other voice.', form('#D94141', 2, 0.5, 1)],
      ['Bankai', 'The true shape, finally released.', form('#1A1A22', 3, 0.6, 2)],
      ['Final Form', 'Everything, knowing what it costs.', form('#C9D6FF', 4, 0.74, 2)],
      ['Soul King', 'The pillar the world rests on.', form('#D9B8FF', 5, 0.86, 3)],
    ]),
    palette: {
      accent: '#FF5C5C',
      accentText: '#1A0004',
      accentSoft: '#3A0B12',
      highlight: '#E0E7FF',
      monarch: '#C084FC',
      monarchSoft: '#25143A',
      background: '#0A0A0F',
      surface: '#14141C',
      surfaceRaised: '#1F1F2B',
      border: '#26262F',
      borderStrong: '#414150',
      track: '#1F1F2B',
    },
  },

  pirate: {
    id: 'pirate',
    name: 'The Pirate',
    systemLabel: 'The Bounty',
    levelWord: 'Bounty',
    tagline: 'Laughed at the odds and set sail anyway.',
    motif: 'brim' as const,
    ...ladderOf([
      ['Rookie', 'No bounty worth printing.', form('#E8C97A', 0, 0.48, 0)],
      ['Supernova', 'The Marines know the name now.', form('#E3B85C', 1, 0.54, 1)],
      ['Haki', 'Will you can put behind a punch.', form('#3A2D1F', 2, 0.6, 1)],
      ['Awakened Gear', 'The body is a weapon you invented.', form('#FF6B6B', 3, 0.66, 2)],
      ['Gear Five', 'Fighting like it is a game again.', form('#FFFFFF', 4, 0.74, 3)],
      ['Nika', 'Freedom, in the shape of a person.', form('#FFD93D', 5, 0.86, 3)],
    ]),
    palette: {
      accent: '#FF4D6D',
      accentText: '#1A0006',
      accentSoft: '#3A0A16',
      highlight: '#FFD93D',
      monarch: '#4ECDC4',
      monarchSoft: '#06282A',
      background: '#0B0E14',
      surface: '#141922',
      surfaceRaised: '#1E2532',
      border: '#242C3A',
      borderStrong: '#3B475C',
      track: '#1E2532',
    },
  },
};

/** The Ascension for an id, falling back to the default rather than throwing. */
export function ascensionFor(id: string | null | undefined): Ascension {
  const found = ASCENSION_IDS.find((candidate) => candidate === id);
  return ASCENSIONS[found ?? DEFAULT_ASCENSION];
}

export function isAscensionId(value: string): value is AscensionId {
  return ASCENSION_IDS.some((candidate) => candidate === value);
}

/** The tier a rank renders on this Ascension. Total: every Ascension has all six. */
export function tierForRank(ascension: Ascension, rank: Rank): AscensionTier {
  return ascension.byRank[rank];
}

export function tierForLevel(ascension: Ascension, level: number): AscensionTier {
  return tierForRank(ascension, rankForLevel(level));
}

/**
 * The next tier up and the level it starts at, or null at the top.
 *
 * Reads the thresholds from `hunter` rather than restating them, so an Ascension can
 * never disagree with the ladder it is decorating.
 */
export function nextTier(
  ascension: Ascension,
  level: number,
): { tier: AscensionTier; atLevel: number } | null {
  const ascending = [...RANK_THRESHOLDS].reverse();
  const next = ascending.find((entry) => entry.minLevel > level);
  return next ? { tier: tierForRank(ascension, next.rank), atLevel: next.minLevel } : null;
}

/** Every tier with the level it unlocks at — the ladder, for the Ascension screen. */
export function ascensionLadder(ascension: Ascension): { tier: AscensionTier; atLevel: number }[] {
  return ascension.tiers.map((tier) => ({ tier, atLevel: RANK_MIN_LEVEL[tier.rank] }));
}
