/**
 * Badges.
 *
 * Every one is a threshold on something the user genuinely did — no
 * participation awards, and nothing that can be earned by opening the app.
 * The definitions live here so the same rules decide what is earned, what is
 * shown as locked, and what the next one is.
 */
import { type Dec, decToNumber } from './decimal';
import { type Rank } from './hunter';

export type BadgeKey =
  | 'first_blood'
  | 'ten_sessions'
  | 'fifty_sessions'
  | 'hundred_sessions'
  | 'first_record'
  | 'ten_records'
  | 'week_streak'
  | 'month_streak'
  | 'hundred_streak'
  | 'tonne_club'
  | 'ten_tonne_club'
  | 'hundred_tonne_club'
  | 'rank_d'
  | 'rank_c'
  | 'rank_b'
  | 'rank_a'
  | 'rank_s';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'monarch';

export interface BadgeDefinition {
  key: BadgeKey;
  name: string;
  /** What earns it, in plain terms. Shown while still locked. */
  requirement: string;
  tier: BadgeTier;
  xp: number;
}

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  {
    key: 'first_blood',
    name: 'Awakened',
    requirement: 'Finish your first workout',
    tier: 'bronze',
    xp: 50,
  },
  {
    key: 'ten_sessions',
    name: 'Regular',
    requirement: 'Finish 10 workouts',
    tier: 'bronze',
    xp: 100,
  },
  {
    key: 'fifty_sessions',
    name: 'Veteran',
    requirement: 'Finish 50 workouts',
    tier: 'silver',
    xp: 300,
  },
  {
    key: 'hundred_sessions',
    name: 'Centurion',
    requirement: 'Finish 100 workouts',
    tier: 'gold',
    xp: 700,
  },
  {
    key: 'first_record',
    name: 'Breakthrough',
    requirement: 'Set your first personal record',
    tier: 'bronze',
    xp: 75,
  },
  {
    key: 'ten_records',
    name: 'Record Breaker',
    requirement: 'Set 10 personal records',
    tier: 'silver',
    xp: 250,
  },
  {
    key: 'week_streak',
    name: 'Unbroken',
    requirement: 'Train 7 days in a row',
    tier: 'bronze',
    xp: 120,
  },
  {
    key: 'month_streak',
    name: 'Relentless',
    requirement: 'Train 30 days in a row',
    tier: 'gold',
    xp: 600,
  },
  {
    key: 'hundred_streak',
    name: 'Monarch of Habit',
    requirement: 'Train 100 days in a row',
    tier: 'monarch',
    xp: 2000,
  },
  {
    key: 'tonne_club',
    name: 'One Tonne',
    requirement: 'Move 1,000 kg in a single session',
    tier: 'bronze',
    xp: 80,
  },
  {
    key: 'ten_tonne_club',
    name: 'Ten Tonnes',
    requirement: 'Move 10,000 kg in a single session',
    tier: 'silver',
    xp: 300,
  },
  {
    key: 'hundred_tonne_club',
    name: 'Hundred Tonnes',
    requirement: 'Move 100,000 kg in total',
    tier: 'gold',
    xp: 500,
  },
  { key: 'rank_d', name: 'D-Rank Hunter', requirement: 'Reach level 10', tier: 'bronze', xp: 100 },
  { key: 'rank_c', name: 'C-Rank Hunter', requirement: 'Reach level 20', tier: 'silver', xp: 200 },
  { key: 'rank_b', name: 'B-Rank Hunter', requirement: 'Reach level 35', tier: 'silver', xp: 400 },
  { key: 'rank_a', name: 'A-Rank Hunter', requirement: 'Reach level 55', tier: 'gold', xp: 800 },
  {
    key: 'rank_s',
    name: 'S-Rank Hunter',
    requirement: 'Reach level 80',
    tier: 'monarch',
    xp: 2000,
  },
];

export const BADGES_BY_KEY: Record<BadgeKey, BadgeDefinition> = Object.fromEntries(
  BADGE_DEFINITIONS.map((badge) => [badge.key, badge]),
) as Record<BadgeKey, BadgeDefinition>;

export interface BadgeContext {
  totalWorkouts: number;
  totalRecords: number;
  longestStreakDays: number;
  /** The largest single-session volume, in kilograms. */
  bestSessionVolumeKg: Dec;
  /** Lifetime volume, in kilograms. */
  lifetimeVolumeKg: Dec;
  level: number;
  rank: Rank;
}

/** Whether a single badge's condition is met. */
function isEarned(key: BadgeKey, context: BadgeContext): boolean {
  switch (key) {
    case 'first_blood':
      return context.totalWorkouts >= 1;
    case 'ten_sessions':
      return context.totalWorkouts >= 10;
    case 'fifty_sessions':
      return context.totalWorkouts >= 50;
    case 'hundred_sessions':
      return context.totalWorkouts >= 100;
    case 'first_record':
      return context.totalRecords >= 1;
    case 'ten_records':
      return context.totalRecords >= 10;
    case 'week_streak':
      return context.longestStreakDays >= 7;
    case 'month_streak':
      return context.longestStreakDays >= 30;
    case 'hundred_streak':
      return context.longestStreakDays >= 100;
    case 'tonne_club':
      return decToNumber(context.bestSessionVolumeKg) >= 1000;
    case 'ten_tonne_club':
      return decToNumber(context.bestSessionVolumeKg) >= 10_000;
    case 'hundred_tonne_club':
      return decToNumber(context.lifetimeVolumeKg) >= 100_000;
    case 'rank_d':
      return context.level >= 10;
    case 'rank_c':
      return context.level >= 20;
    case 'rank_b':
      return context.level >= 35;
    case 'rank_a':
      return context.level >= 55;
    case 'rank_s':
      return context.level >= 80;
  }
}

/**
 * Newly earned badges, given what is already held. Returns only the additions,
 * so the caller can both persist them and show them.
 */
export function detectBadges(
  context: BadgeContext,
  alreadyEarned: ReadonlySet<string>,
): BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter(
    (badge) => !alreadyEarned.has(badge.key) && isEarned(badge.key, context),
  );
}

/** Every badge with its state, for the collection screen. */
export function badgeProgress(
  context: BadgeContext,
  alreadyEarned: ReadonlySet<string>,
): { badge: BadgeDefinition; earned: boolean }[] {
  return BADGE_DEFINITIONS.map((badge) => ({
    badge,
    earned: alreadyEarned.has(badge.key) || isEarned(badge.key, context),
  }));
}
