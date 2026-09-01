/**
 * The Hunter System: levels, ranks, XP and derived stats.
 *
 * The framing is a game; the numbers are not. Every figure here is computed
 * deterministically from what the user actually logged — the same discipline
 * BRD §8.4 imposes on AI output, for the same reason. A level that does not
 * correspond to real work is a lie the user will eventually notice, and the
 * whole motivational effect depends on them not noticing that.
 *
 * XP is an append-only ledger in the database; this module owns the arithmetic
 * that turns work into XP and XP into a level.
 */
import { type Dec, decToNumber } from './decimal';

// ------------------------------------------------------------------- levels --

/**
 * XP needed to climb one level. Quadratic, so early levels come quickly and
 * later ones demand real accumulated work: L1→2 is 100, L10→11 is 955, and
 * L30→31 is 5,655.
 */
export function xpToNextLevel(level: number): number {
  if (level < 1) throw new RangeError(`Level must be at least 1: ${level}`);
  const step = level - 1;
  return 100 + 50 * step + 5 * step * step;
}

/** Total XP required to have reached a level from zero. */
export function xpForLevel(level: number): number {
  if (level < 1) throw new RangeError(`Level must be at least 1: ${level}`);
  let total = 0;
  for (let current = 1; current < level; current += 1) total += xpToNextLevel(current);
  return total;
}

/** Guards against an unbounded loop on absurd input, and against fantasy levels. */
export const MAX_LEVEL = 200;

export interface LevelProgress {
  level: number;
  /** XP earned toward the next level. */
  xpIntoLevel: number;
  /** XP the current level requires in total. */
  xpForThisLevel: number;
  /** 0..1, for a progress bar. */
  fraction: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelProgress {
  if (!Number.isFinite(totalXp) || totalXp < 0) {
    throw new RangeError(`Total XP must be a non-negative number: ${totalXp}`);
  }

  let level = 1;
  let consumed = 0;

  while (level < MAX_LEVEL) {
    const needed = xpToNextLevel(level);
    if (consumed + needed > totalXp) break;
    consumed += needed;
    level += 1;
  }

  const xpForThisLevel = xpToNextLevel(level);
  const xpIntoLevel = Math.floor(totalXp - consumed);

  return {
    level,
    xpIntoLevel,
    xpForThisLevel,
    // At the cap there is no next level, so the bar reads full rather than
    // dividing by a level that does not exist.
    fraction: level >= MAX_LEVEL ? 1 : Math.min(1, xpIntoLevel / xpForThisLevel),
    totalXp: Math.floor(totalXp),
  };
}

// -------------------------------------------------------------------- ranks --

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

/** The level at which each rank begins. */
export const RANK_THRESHOLDS: readonly { rank: Rank; minLevel: number }[] = [
  { rank: 'S', minLevel: 80 },
  { rank: 'A', minLevel: 55 },
  { rank: 'B', minLevel: 35 },
  { rank: 'C', minLevel: 20 },
  { rank: 'D', minLevel: 10 },
  { rank: 'E', minLevel: 1 },
];

export function rankForLevel(level: number): Rank {
  const found = RANK_THRESHOLDS.find((entry) => level >= entry.minLevel);
  return found?.rank ?? 'E';
}

/** The level at which the next rank begins, or null at the top. */
export function nextRankAt(level: number): { rank: Rank; atLevel: number } | null {
  const ascending = [...RANK_THRESHOLDS].reverse();
  const next = ascending.find((entry) => entry.minLevel > level);
  return next ? { rank: next.rank, atLevel: next.minLevel } : null;
}

// ----------------------------------------------------------------- earning ---

export interface WorkoutXpInput {
  /** Total volume of the session, in kilograms. */
  volumeKg: Dec;
  /** Completed working sets — warmups excluded, as everywhere else. */
  completedSets: number;
  /** Records set in this session. */
  personalRecords: number;
  /** Consecutive-day streak *including* this session. */
  streakDays: number;
}

export interface XpBreakdown {
  /** Shown to the user line by line, because unexplained XP is arbitrary. */
  session: number;
  volume: number;
  sets: number;
  records: number;
  streakBonus: number;
  total: number;
  /** The multiplier the streak applied, for display as "×1.14". */
  streakMultiplier: number;
}

const XP_PER_SESSION = 50;
const XP_PER_100KG = 1;
const XP_PER_SET = 2;
const XP_PER_RECORD = 100;
/** Each streak day adds 2%, capped so a long streak cannot trivialise levels. */
const STREAK_BONUS_PER_DAY = 0.02;
const MAX_STREAK_DAYS_COUNTED = 14;

/**
 * XP for a finished workout, itemised.
 *
 * Volume is deliberately the smallest term: rewarding it too heavily would make
 * the optimal strategy "do endless light sets", which is worse training and the
 * user would feel the app pushing them toward it.
 */
export function workoutXp(input: WorkoutXpInput): XpBreakdown {
  const volumeKg = Math.max(0, decToNumber(input.volumeKg));
  const sets = Math.max(0, Math.floor(input.completedSets));
  const records = Math.max(0, Math.floor(input.personalRecords));
  const streak = Math.max(0, Math.floor(input.streakDays));

  const session = XP_PER_SESSION;
  const volume = Math.floor((volumeKg / 100) * XP_PER_100KG);
  const setsXp = sets * XP_PER_SET;
  const recordsXp = records * XP_PER_RECORD;

  const base = session + volume + setsXp + recordsXp;
  const streakMultiplier =
    1 + Math.min(streak, MAX_STREAK_DAYS_COUNTED) * STREAK_BONUS_PER_DAY;
  const streakBonus = Math.floor(base * (streakMultiplier - 1));

  return {
    session,
    volume,
    sets: setsXp,
    records: recordsXp,
    streakBonus,
    streakMultiplier: Math.round(streakMultiplier * 100) / 100,
    total: base + streakBonus,
  };
}

// -------------------------------------------------------------------- stats --

/**
 * The three attributes. Five would be more faithful to the source material, but
 * only these three can be derived honestly from lifting data — the rest would
 * be decoration dressed as measurement.
 */
export type StatKey = 'strength' | 'endurance' | 'discipline';

export interface Stats {
  strength: number;
  endurance: number;
  discipline: number;
}

export interface StatsInput {
  /** Best estimated 1RM per exercise, in kilograms. Top few dominate. */
  bestOneRepMaxes: readonly Dec[];
  /** Volume over the last 30 days, in kilograms. */
  volume30dKg: Dec;
  currentStreakDays: number;
  workoutsLast30Days: number;
}

/** How many lifts count toward strength — a total, like a powerlifting total. */
const STRENGTH_LIFTS_COUNTED = 3;

export function deriveStats(input: StatsInput): Stats {
  const top = [...input.bestOneRepMaxes]
    .map(decToNumber)
    .sort((a, b) => b - a)
    .slice(0, STRENGTH_LIFTS_COUNTED)
    .reduce((sum, value) => sum + value, 0);

  return {
    // A 300 kg three-lift total reads as 30 strength.
    strength: Math.floor(top / 10),
    // 30 tonnes in a month reads as 30 endurance.
    endurance: Math.floor(decToNumber(input.volume30dKg) / 1000),
    // Consistency, not volume: showing up is the whole stat.
    discipline: Math.floor(input.currentStreakDays + input.workoutsLast30Days * 1.5),
  };
}

export const STAT_LABELS: Record<StatKey, string> = {
  strength: 'STR',
  endurance: 'END',
  discipline: 'DIS',
};

/** What each stat is derived from, shown in the UI so it is never mysterious. */
export const STAT_SOURCES: Record<StatKey, string> = {
  strength: 'Best estimated 1RM across your three strongest lifts',
  endurance: 'Total volume moved in the last 30 days',
  discipline: 'Current streak plus workouts in the last 30 days',
};
