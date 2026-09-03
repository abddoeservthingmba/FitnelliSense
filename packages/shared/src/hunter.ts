/**
 * The Hunter System contract.
 *
 * The framing is a game, so the payloads carry the itemisation the UI shows —
 * XP is never a bare number on screen, because a bare number is arbitrary.
 */
import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  repsSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives';
import { prTypeSchema } from './enums';

export const rankSchema = z.enum(['E', 'D', 'C', 'B', 'A', 'S']);
export const statKeySchema = z.enum(['strength', 'endurance', 'discipline']);
export const xpSourceSchema = z.enum(['workout', 'quest', 'badge']);
export const badgeTierSchema = z.enum(['bronze', 'silver', 'gold', 'monarch']);

export const questUnitSchema = z.enum(['workout', 'sets', 'kg', 'record', 'minutes', 'exercises']);

export const statsSchema = z.object({
  strength: z.number().int(),
  endurance: z.number().int(),
  discipline: z.number().int(),
});

export const xpBreakdownSchema = z.object({
  session: z.number().int(),
  volume: z.number().int(),
  sets: z.number().int(),
  records: z.number().int(),
  /** Minutes and metres (FR-CAR-05). Zero for a session with no cardio. */
  cardio: z.number().int(),
  streakBonus: z.number().int(),
  streakMultiplier: z.number(),
  total: z.number().int(),
});

export const hunterStatusSchema = z.object({
  level: z.number().int(),
  rank: rankSchema,
  totalXp: z.number().int(),
  xpIntoLevel: z.number().int(),
  xpForThisLevel: z.number().int(),
  /** 0..1, for the level bar. */
  fraction: z.number(),
  nextRank: z.object({ rank: rankSchema, atLevel: z.number().int() }).nullable(),
  stats: statsSchema,
  /** What each stat is derived from, so no number on screen is unexplained. */
  statSources: z.record(statKeySchema, z.string()),
  /** Headline totals the status screen shows beside the stats. */
  totals: z.object({
    workouts: z.number().int(),
    records: z.number().int(),
    lifetimeVolumeKg: positiveDecimalStringSchema,
    currentStreakDays: z.number().int(),
    longestStreakDays: z.number().int(),
  }),
  badgesEarned: z.number().int(),
  badgesTotal: z.number().int(),
});

export const questSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  text: shortTextSchema,
  target: z.number().int(),
  progress: z.number().int(),
  unit: questUnitSchema,
  xp: z.number().int(),
  /** 0..1 for the bar. */
  fraction: z.number(),
  isComplete: z.boolean(),
  /** Completed quests still need collecting; that tap is the payoff. */
  isClaimed: z.boolean(),
});

export const questBoardSchema = z.object({
  date: isoDateSchema,
  quests: z.array(questSchema),
  /** XP still sitting uncollected, so the screen can nag pleasantly. */
  unclaimedXp: z.number().int(),
});

export const badgeSchema = z.object({
  key: z.string(),
  name: shortTextSchema,
  requirement: z.string(),
  tier: badgeTierSchema,
  xp: z.number().int(),
  earned: z.boolean(),
  earnedAt: isoDateTimeSchema.nullable(),
});

export const badgeCollectionSchema = z.object({
  badges: z.array(badgeSchema),
  earned: z.number().int(),
  total: z.number().int(),
});

/**
 * What a finished workout did to the Hunter System. Returned alongside the
 * workout summary so the client can show one combined moment rather than
 * discovering a level-up on the next screen.
 */
export const hunterRewardSchema = z.object({
  xp: xpBreakdownSchema,
  levelBefore: z.number().int(),
  levelAfter: z.number().int(),
  rankBefore: rankSchema,
  rankAfter: rankSchema,
  leveledUp: z.boolean(),
  rankedUp: z.boolean(),
  /** Badges earned by this session. */
  badgesEarned: z.array(badgeSchema),
  /** Quests this session completed, ready to claim. */
  questsCompleted: z.array(questSchema),
  statsBefore: statsSchema,
  statsAfter: statsSchema,
});

export const claimQuestResponseSchema = z.object({
  quest: questSchema,
  xpAwarded: z.number().int(),
  status: hunterStatusSchema,
  leveledUp: z.boolean(),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int(),
  userId: uuidSchema,
  displayName: shortTextSchema,
  level: z.number().int(),
  hunterRank: rankSchema,
  totalXp: z.number().int(),
  /** Full stats, per the product decision to show them. Opt-in only. */
  volumeKg: positiveDecimalStringSchema,
  /**
   * FR-LB-07: activity as a count, not a streak. A streak depends on the
   * viewer's own midnight, and the server does not know the timezone of anyone
   * but the caller — so a 'streak' column would be wrong for most of the people
   * on the board. This field used to exist and was always sent as 0, which is
   * worse than not offering it.
   */
  workouts: z.number().int(),
  isYou: z.boolean(),
});

export const leaderboardSchema = z.object({
  window: z.enum(['week', 'month', 'all']),
  entries: z.array(leaderboardEntrySchema),
  /** Null when the viewer has not opted in — they are simply absent. */
  yourPosition: z.number().int().nullable(),
  optedIn: z.boolean(),
});

export const leaderboardQuerySchema = z.object({
  window: z.enum(['week', 'month', 'all']).default('week'),
});

/**
 * One athlete's public training profile — FR-LB-08.
 *
 * What is deliberately NOT here is the point of the shape. No email, no
 * bodyweight, no nutrition, no notes, no individual session dates. Someone
 * opted in to being compared on training, and that is the whole extent of it.
 *
 * Bodyweight in particular is excluded even though it would make the strength
 * numbers more meaningful: it is health data about a person's body, and a
 * leaderboard opt-in is not consent to publish it.
 */
export const athleteMuscleSchema = z.object({
  group: z.string(),
  volumeKg: positiveDecimalStringSchema,
  sets: z.number().int(),
  sharePercent: z.number(),
});

export const athleteRecordSchema = z.object({
  exerciseName: shortTextSchema,
  prType: prTypeSchema,
  value: positiveDecimalStringSchema,
  reps: repsSchema.nullable(),
});

export const athleteStatsSchema = z.object({
  userId: uuidSchema,
  displayName: shortTextSchema,
  /**
   * Their chosen Ascension, so their tier renders as THEIRS.
   *
   * Showing another athlete's rank in the viewer's costume would misname them —
   * a Hokage displayed as a Shadow Sovereign. Null when they have not chosen.
   */
  ascension: z.enum(['monarch', 'saiyan', 'shinobi', 'shinigami', 'pirate']).nullable(),
  level: z.number().int(),
  hunterRank: rankSchema,
  totalXp: z.number().int(),
  workouts: z.number().int(),
  sets: z.number().int(),
  volumeKg: positiveDecimalStringSchema,
  /** Primary muscle groups only, split so the shares still sum to the whole. */
  muscles: z.array(athleteMuscleSchema),
  records: z.array(athleteRecordSchema),
});

export const athleteProfileSchema = z.object({
  window: z.enum(['week', 'month', 'all']),
  athlete: athleteStatsSchema,
  /**
   * The viewer's own figures over the SAME window, so the comparison is like
   * for like. Null when the viewer is looking at their own profile — there is
   * nothing to compare against yourself.
   */
  you: athleteStatsSchema.nullable(),
  isYou: z.boolean(),
});

export const athleteProfileQuerySchema = z.object({
  window: z.enum(['week', 'month', 'all']).default('month'),
  today: z.iso.date().optional(),
});

export type Rank = z.infer<typeof rankSchema>;
export type Stats = z.infer<typeof statsSchema>;
export type XpBreakdown = z.infer<typeof xpBreakdownSchema>;
export type HunterStatus = z.infer<typeof hunterStatusSchema>;
export type Quest = z.infer<typeof questSchema>;
export type QuestBoard = z.infer<typeof questBoardSchema>;
export type Badge = z.infer<typeof badgeSchema>;
export type BadgeCollection = z.infer<typeof badgeCollectionSchema>;
export type HunterReward = z.infer<typeof hunterRewardSchema>;
export type ClaimQuestResponse = z.infer<typeof claimQuestResponseSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type Leaderboard = z.infer<typeof leaderboardSchema>;
export type AthleteMuscle = z.infer<typeof athleteMuscleSchema>;
export type AthleteRecord = z.infer<typeof athleteRecordSchema>;
export type AthleteStats = z.infer<typeof athleteStatsSchema>;
export type AthleteProfile = z.infer<typeof athleteProfileSchema>;
