/**
 * Paths — the same ladder, told six different ways.
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE: a Path changes nothing but
 * words and colour. Every threshold, every XP award, every stat and every
 * rank boundary is identical whichever Path you pick. `Rank` stays E..S
 * internally, in the database and on the wire; a Path is a lookup from that
 * rank to a name.
 *
 * This is what makes the feature safe. If a Path could alter a threshold, two
 * users' levels would stop being comparable, the leaderboard would become
 * nonsense, and someone would pick the Path that levels fastest rather than
 * the one they like. So the tier list is exactly six entries — one per rank —
 * and a test asserts that for every Path.
 *
 * It also means the names are data. Swapping a tier list is a one-file change
 * that touches no logic, which matters because these particular names are
 * placeholders for testing and will have to be replaced with original ones
 * before the app is published.
 */
import type { Rank } from './hunter';
import { RANK_MIN_LEVEL, RANK_THRESHOLDS, rankForLevel } from './hunter';

export type PathId = 'monarch' | 'saiyan' | 'shinobi' | 'shinigami' | 'pirate';

/** Every Path a profile may hold. The default is first. */
export const PATH_IDS: readonly PathId[] = ['monarch', 'saiyan', 'shinobi', 'shinigami', 'pirate'];

export const DEFAULT_PATH: PathId = 'monarch';

export interface PathTier {
  /** The internal rank this tier renders. Never shown raw once a Path is set. */
  readonly rank: Rank;
  readonly name: string;
  /** One line, shown when the tier is reached. */
  readonly blurb: string;
}

/**
 * The colours a Path overrides.
 *
 * Deliberately only the accents. Background, surfaces and text stay put: they
 * carry the contrast guarantees (NFR-U-04), and re-deriving a readable text
 * colour per Path is five chances to ship something illegible. The Path gets
 * to change the personality, not the readability.
 */
export interface PathPalette {
  readonly accent: string;
  readonly accentText: string;
  readonly accentSoft: string;
  readonly highlight: string;
  readonly monarch: string;
  readonly monarchSoft: string;
  /** A hint of the Path in the darkest surface, so it is not only the accent. */
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly track: string;
}

export interface Path {
  readonly id: PathId;
  /** Shown in the picker. */
  readonly name: string;
  /** What this Path calls the whole progression, replacing "the System". */
  readonly systemLabel: string;
  /** What it calls a level, e.g. "Power Level". */
  readonly levelWord: string;
  /** One sentence in the picker. */
  readonly tagline: string;
  /** Exactly six, ascending E to S. Derived from `byRank`, never beside it. */
  readonly tiers: readonly PathTier[];
  /**
   * The same six, keyed by rank.
   *
   * A total record, so `tierForRank` is a lookup that cannot miss. The
   * alternative — searching the array and falling back — is a branch that can
   * never fire and therefore can never be tested.
   */
  readonly byRank: Readonly<Record<Rank, PathTier>>;
  readonly palette: PathPalette;
}

/** A tier as written in a Path: its name and its one line. */
type TierSpec = readonly [name: string, blurb: string];

/**
 * Builds both views of a Path's six tiers from one six-tuple.
 *
 * The tuple type is what guarantees six. Writing every rank out explicitly is
 * what makes the record total — TypeScript rejects a Path that omits one, so
 * the invariant is enforced at compile time as well as by a test.
 */
function ladderOf(
  specs: readonly [TierSpec, TierSpec, TierSpec, TierSpec, TierSpec, TierSpec],
): Pick<Path, 'tiers' | 'byRank'> {
  const [e, d, c, b, a, s] = specs;
  const tier = (rank: Rank, spec: TierSpec): PathTier => ({
    rank,
    name: spec[0],
    blurb: spec[1],
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

export const PATHS: Readonly<Record<PathId, Path>> = {
  /**
   * The original ladder, kept as the default so an existing account looks
   * exactly as it did before Paths existed.
   */
  monarch: {
    id: 'monarch',
    name: 'The Monarch',
    systemLabel: 'The System',
    levelWord: 'Level',
    tagline: 'A nobody who kept clearing gates until the world had to rank him.',
    ...ladderOf([
      ['E-Rank Hunter', 'Everyone starts at the bottom of the list.'],
      ['Awakened', 'Something in you answered.'],
      ['Elite Hunter', 'They stopped putting you in the easy gates.'],
      ['National Level', 'A country counts you as an asset.'],
      ['Shadow Sovereign', 'The army follows without being asked.'],
      ['Monarch', 'There is nothing above this.'],
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
    ...ladderOf([
      ['Base Form', 'Nothing wrong with the basics.'],
      ['Kaioken', 'More output than the body wants to give.'],
      ['Super Saiyan', 'The first wall came down.'],
      ['Ascended', 'Holding the form takes no effort now.'],
      ['Beyond Ascended', 'Power without the noise.'],
      ['Ultra Instinct', 'The body moves before you decide to.'],
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
    ...ladderOf([
      ['Academy Student', 'Still failing the basic technique.'],
      ['Genin', 'Assigned a squad and a headband.'],
      ['Chunin', 'Trusted to lead a mission.'],
      ['Jonin', 'The one they send when it matters.'],
      ['Sannin', 'A name spoken in other villages.'],
      ['Hokage', 'The whole village is behind you.'],
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
    ...ladderOf([
      ['Substitute', 'The badge is not official.'],
      ['Shinigami', 'The blade answers to you.'],
      ['Visored', 'You made peace with the other voice.'],
      ['Bankai', 'The true shape, finally released.'],
      ['Final Form', 'Everything, knowing what it costs.'],
      ['Soul King', 'The pillar the world rests on.'],
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
    ...ladderOf([
      ['Rookie', 'No bounty worth printing.'],
      ['Supernova', 'The Marines know the name now.'],
      ['Haki', 'Will you can put behind a punch.'],
      ['Awakened Gear', 'The body is a weapon you invented.'],
      ['Gear Five', 'Fighting like it is a game again.'],
      ['Nika', 'Freedom, in the shape of a person.'],
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

/** The Path for an id, falling back to the default rather than throwing. */
export function pathFor(id: string | null | undefined): Path {
  const found = PATH_IDS.find((candidate) => candidate === id);
  return PATHS[found ?? DEFAULT_PATH];
}

export function isPathId(value: string): value is PathId {
  return PATH_IDS.some((candidate) => candidate === value);
}

/** The tier a rank renders on this Path. Total: every Path has all six. */
export function tierForRank(path: Path, rank: Rank): PathTier {
  return path.byRank[rank];
}

export function tierForLevel(path: Path, level: number): PathTier {
  return tierForRank(path, rankForLevel(level));
}

/**
 * The next tier up and the level it starts at, or null at the top.
 *
 * Reads the thresholds from `hunter` rather than restating them, so a Path can
 * never disagree with the ladder it is decorating.
 */
export function nextTier(path: Path, level: number): { tier: PathTier; atLevel: number } | null {
  const ascending = [...RANK_THRESHOLDS].reverse();
  const next = ascending.find((entry) => entry.minLevel > level);
  return next ? { tier: tierForRank(path, next.rank), atLevel: next.minLevel } : null;
}

/** Every tier with the level it unlocks at — the ladder, for the Path screen. */
export function pathLadder(path: Path): { tier: PathTier; atLevel: number }[] {
  return path.tiers.map((tier) => ({ tier, atLevel: RANK_MIN_LEVEL[tier.rank] }));
}
