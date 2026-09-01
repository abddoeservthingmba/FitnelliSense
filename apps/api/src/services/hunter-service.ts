/**
 * The Hunter System, server side.
 *
 * All arithmetic lives in `@fi/domain`; this file gathers the facts it needs
 * and persists the results. Two properties matter more than anything else here:
 *
 * - **XP is a sum of a ledger, never a stored counter.** A counter that drifts
 *   from the work behind it cannot be detected or rebuilt.
 * - **Awarding is idempotent.** A replayed workout completion or a
 *   double-tapped quest claim must not pay twice, and the unique index makes
 *   that structural rather than a matter of care.
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  BADGE_DEFINITIONS,
  STAT_SOURCES,
  currentStreakDays,
  dailyQuests,
  dec,
  deriveStats,
  QUEST_DEFINITIONS,
  detectBadges,
  isoDateDaysAgo,
  levelFromXp,
  nextRankAt,
  questComplete,
  questFraction,
  questProgressFrom,
  rankForLevel,
  workoutXp,
  type BadgeContext,
  type QuestKey,
  type Stats,
} from '@fi/domain';
import type {
  Badge,
  BadgeCollection,
  HunterReward,
  HunterStatus,
  Quest,
  QuestBoard,
} from '@fi/shared';
import {
  dailyQuests as dailyQuestsTable,
  personalRecords,
  userBadges,
  userProfiles,
  workoutExercises,
  workoutSets,
  workouts,
  xpEvents,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { Database } from '../db/client';

// ------------------------------------------------------------------ the facts --

interface HunterFacts {
  totalXp: number;
  totalWorkouts: number;
  totalRecords: number;
  workoutsLast30Days: number;
  volume30dKg: string;
  lifetimeVolumeKg: string;
  bestSessionVolumeKg: string;
  currentStreak: number;
  longestStreak: number;
  bestOneRepMaxes: string[];
  typicalSets: number | null;
  typicalVolumeKg: string | null;
}

/**
 * Everything the System is derived from, in one round trip's worth of queries.
 *
 * `today` comes from the client because a streak is a local calendar fact — the
 * server has no business guessing a timezone.
 */
async function gatherFacts(db: Database, userId: string, today: string): Promise<HunterFacts> {
  const thirtyDaysAgo = `${isoDateDaysAgo(today, 30)}T00:00:00Z`;

  const [ledger] = await db
    .select({ total: sql<string>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));

  const sessions = await db
    .select({
      date: sql<string>`to_char(${workouts.startedAt}, 'YYYY-MM-DD')`,
      volumeKg: workouts.totalVolumeKg,
      startedAt: workouts.startedAt,
    })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.status, 'completed')))
    .orderBy(desc(workouts.startedAt))
    .limit(500);

  const [recordCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(personalRecords)
    .where(eq(personalRecords.userId, userId));

  // Best estimated 1RM per exercise. Epley is applied in SQL here purely to
  // avoid pulling every set across all history; the figure the user *sees*
  // still comes from `@fi/domain` on the read paths that display it.
  const oneRepMaxes = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      best: sql<string>`max(${workoutSets.weightKg} * (1 + least(${workoutSets.reps}, 15) / 30.0))`,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        eq(workoutSets.isCompleted, true),
        sql`${workoutSets.setType} <> 'warmup'`,
        sql`${workoutSets.weightKg} > 0`,
        sql`${workoutSets.reps} > 0`,
      ),
    )
    .groupBy(workoutExercises.exerciseId)
    .orderBy(desc(sql`max(${workoutSets.weightKg} * (1 + least(${workoutSets.reps}, 15) / 30.0))`))
    .limit(5);

  // Completed working sets per session, for scaling quest targets.
  const setCounts = await db
    .select({
      workoutId: workoutExercises.workoutId,
      sets: sql<number>`count(*)::int`,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        eq(workoutSets.isCompleted, true),
        sql`${workoutSets.setType} <> 'warmup'`,
      ),
    )
    .groupBy(workoutExercises.workoutId)
    .limit(30);

  const volumes = sessions.map((session) => Number(session.volumeKg ?? 0));
  const recent = sessions.filter(
    (session) => session.startedAt.toISOString() >= thirtyDaysAgo,
  );

  return {
    totalXp: Number(ledger?.total ?? 0),
    totalWorkouts: sessions.length,
    totalRecords: recordCount?.count ?? 0,
    workoutsLast30Days: recent.length,
    volume30dKg: sum(recent.map((session) => Number(session.volumeKg ?? 0))),
    lifetimeVolumeKg: sum(volumes),
    bestSessionVolumeKg: volumes.length > 0 ? String(Math.max(...volumes)) : '0',
    currentStreak: currentStreakDays(
      sessions.map((session) => session.date),
      today,
    ),
    longestStreak: longestStreak(sessions.map((session) => session.date)),
    bestOneRepMaxes: oneRepMaxes.map((row) => row.best),
    typicalSets: median(setCounts.map((row) => row.sets)),
    typicalVolumeKg: (() => {
      const value = median(recent.map((session) => Number(session.volumeKg ?? 0)));
      return value === null ? null : String(value);
    })(),
  };
}

function sum(values: readonly number[]): string {
  return values.reduce((total, value) => total + value, 0).toFixed(2);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Math.round(value);
}

const DAY_MS = 86_400_000;

/** The longest run of consecutive days ever, for the streak badges. */
function longestStreak(isoDates: readonly string[]): number {
  const days = [...new Set(isoDates)]
    .map((date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS))
    .sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  let previous: number | null = null;

  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

function statsFrom(facts: HunterFacts): Stats {
  return deriveStats({
    bestOneRepMaxes: facts.bestOneRepMaxes.map((value) => dec(Number(value).toFixed(2))),
    volume30dKg: dec(facts.volume30dKg),
    currentStreakDays: facts.currentStreak,
    workoutsLast30Days: facts.workoutsLast30Days,
  });
}

function badgeContextFrom(facts: HunterFacts, level: number): BadgeContext {
  return {
    totalWorkouts: facts.totalWorkouts,
    totalRecords: facts.totalRecords,
    longestStreakDays: facts.longestStreak,
    bestSessionVolumeKg: dec(Number(facts.bestSessionVolumeKg).toFixed(2)),
    lifetimeVolumeKg: dec(facts.lifetimeVolumeKg),
    level,
    rank: rankForLevel(level),
  };
}

// --------------------------------------------------------------------- status --

export async function hunterStatus(
  db: Database,
  userId: string,
  today: string,
): Promise<HunterStatus> {
  const facts = await gatherFacts(db, userId, today);
  const progress = levelFromXp(facts.totalXp);
  const earned = await earnedBadgeKeys(db, userId);

  return {
    level: progress.level,
    rank: rankForLevel(progress.level),
    totalXp: progress.totalXp,
    xpIntoLevel: progress.xpIntoLevel,
    xpForThisLevel: progress.xpForThisLevel,
    fraction: progress.fraction,
    nextRank: nextRankAt(progress.level),
    stats: statsFrom(facts),
    statSources: STAT_SOURCES,
    totals: {
      workouts: facts.totalWorkouts,
      records: facts.totalRecords,
      lifetimeVolumeKg: facts.lifetimeVolumeKg,
      currentStreakDays: facts.currentStreak,
      longestStreakDays: facts.longestStreak,
    },
    badgesEarned: earned.size,
    badgesTotal: BADGE_DEFINITIONS.length,
  };
}

async function earnedBadgeKeys(db: Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ badgeKey: userBadges.badgeKey })
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  return new Set(rows.map((row) => row.badgeKey));
}

// --------------------------------------------------------------------- badges --

export async function badgeCollection(
  db: Database,
  userId: string,
  today: string,
): Promise<BadgeCollection> {
  const [facts, rows] = await Promise.all([
    gatherFacts(db, userId, today),
    db
      .select({ badgeKey: userBadges.badgeKey, earnedAt: userBadges.earnedAt })
      .from(userBadges)
      .where(eq(userBadges.userId, userId)),
  ]);

  const earnedAt = new Map(rows.map((row) => [row.badgeKey, row.earnedAt]));
  const level = levelFromXp(facts.totalXp).level;
  const context = badgeContextFrom(facts, level);

  // A badge whose condition is met but which has not been persisted yet still
  // shows as earned — the next completed workout writes it.
  const pending = new Set(detectBadges(context, new Set(earnedAt.keys())).map((b) => b.key));

  const badges: Badge[] = BADGE_DEFINITIONS.map((definition) => ({
    key: definition.key,
    name: definition.name,
    requirement: definition.requirement,
    tier: definition.tier,
    xp: definition.xp,
    earned: earnedAt.has(definition.key) || pending.has(definition.key),
    earnedAt: earnedAt.get(definition.key)?.toISOString() ?? null,
  }));

  return {
    badges,
    earned: badges.filter((badge) => badge.earned).length,
    total: badges.length,
  };
}

// --------------------------------------------------------------------- quests --

function toQuest(row: typeof dailyQuestsTable.$inferSelect): Quest {
  return {
    id: row.id,
    key: row.questKey,
    // The stored row is the source of truth for target and text alike; the text
    // is rebuilt from the definition so wording changes apply retroactively.
    text: questText(row.questKey as QuestKey, row.target),
    target: row.target,
    progress: row.progress,
    unit: questUnit(row.questKey as QuestKey),
    xp: row.xp,
    fraction: questFraction(row.progress, row.target),
    isComplete: row.completedAt !== null || questComplete(row.progress, row.target),
    isClaimed: row.claimedAt !== null,
  };
}

/** Rebuilds a quest's wording from its definition, so copy is not frozen in rows. */
function questText(key: QuestKey, target: number): string {
  const definition = dailyQuestDefinition(key);
  return definition.template.replace(
    '{target}',
    definition.unit === 'kg' ? target.toLocaleString() : String(target),
  );
}

function questUnit(key: QuestKey): Quest['unit'] {
  return dailyQuestDefinition(key).unit;
}

function dailyQuestDefinition(key: QuestKey) {
  const definition = QUEST_DEFINITIONS[key];
  if (!definition) throw notFound('That quest no longer exists');
  return definition;
}

/**
 * Today's quests, generated on first request of the day and stable thereafter.
 *
 * Generation is idempotent: the unique index on (user, date, key) means a
 * concurrent second request cannot create duplicates.
 */
export async function questBoard(
  db: Database,
  userId: string,
  today: string,
): Promise<QuestBoard> {
  const existing = await db
    .select()
    .from(dailyQuestsTable)
    .where(and(eq(dailyQuestsTable.userId, userId), eq(dailyQuestsTable.questDate, today)));

  if (existing.length === 0) {
    const facts = await gatherFacts(db, userId, today);
    const level = levelFromXp(facts.totalXp).level;
    const [profile] = await db
      .select({ sessionMinutes: userProfiles.sessionMinutes })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const generated = dailyQuests(userId, today, {
      typicalSets: facts.typicalSets,
      typicalVolumeKg: facts.typicalVolumeKg === null ? null : dec(facts.typicalVolumeKg),
      sessionMinutes: profile?.sessionMinutes ?? null,
      level,
    });

    await db
      .insert(dailyQuestsTable)
      .values(
        generated.map((quest) => ({
          id: newId(),
          userId,
          questDate: today,
          questKey: quest.key,
          target: quest.target,
          xp: quest.xp,
        })),
      )
      .onConflictDoNothing();

    return questBoard(db, userId, today);
  }

  const quests = existing.map(toQuest).sort((a, b) => a.key.localeCompare(b.key));

  return {
    date: today,
    quests,
    unclaimedXp: quests
      .filter((quest) => quest.isComplete && !quest.isClaimed)
      .reduce((total, quest) => total + quest.xp, 0),
  };
}

/** Collecting a completed quest. Idempotent: a second tap awards nothing. */
export async function claimQuest(
  db: Database,
  userId: string,
  questId: string,
): Promise<{ quest: Quest; xpAwarded: number }> {
  const [row] = await db
    .select()
    .from(dailyQuestsTable)
    .where(and(eq(dailyQuestsTable.id, questId), eq(dailyQuestsTable.userId, userId)))
    .limit(1);

  if (!row) throw notFound('That quest could not be found');
  if (row.claimedAt !== null) throw conflict('That quest has already been collected');
  if (!questComplete(row.progress, row.target)) {
    throw conflict('That quest is not finished yet');
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(dailyQuestsTable)
      .set({ claimedAt: now, completedAt: row.completedAt ?? now })
      .where(eq(dailyQuestsTable.id, row.id));

    await tx
      .insert(xpEvents)
      .values({
        id: newId(),
        userId,
        source: 'quest',
        amount: row.xp,
        referenceId: row.id,
      })
      .onConflictDoNothing();
  });

  const [updated] = await db
    .select()
    .from(dailyQuestsTable)
    .where(eq(dailyQuestsTable.id, row.id))
    .limit(1);

  return {
    quest: toQuest(updated ?? { ...row, claimedAt: now }),
    xpAwarded: row.xp,
  };
}

// ----------------------------------------------------------------- completion --

export interface SessionSummary {
  workoutId: string;
  volumeKg: string;
  completedSets: number;
  distinctExercises: number;
  durationMinutes: number;
  personalRecords: number;
}

/**
 * Applies a finished workout to the System: XP, quest progress, badges.
 *
 * Called inside workout completion so the summary screen can show one moment.
 * Every write is idempotent, because workout completion itself can be replayed
 * by the offline outbox (NFR-R-03).
 */
export async function applyWorkout(
  db: Database,
  userId: string,
  session: SessionSummary,
  today: string,
): Promise<HunterReward> {
  const before = await gatherFacts(db, userId, today);
  const levelBefore = levelFromXp(before.totalXp).level;
  const statsBefore = statsFrom(before);

  const xp = workoutXp({
    volumeKg: dec(session.volumeKg),
    completedSets: session.completedSets,
    personalRecords: session.personalRecords,
    // The streak already includes today, since the workout is complete.
    streakDays: before.currentStreak,
  });

  // Make sure today's quests exist before crediting progress against them.
  await questBoard(db, userId, today);

  const questRows = await db
    .select()
    .from(dailyQuestsTable)
    .where(and(eq(dailyQuestsTable.userId, userId), eq(dailyQuestsTable.questDate, today)));

  const now = new Date();
  const completedNow: Quest[] = [];

  await db.transaction(async (tx) => {
    await tx
      .insert(xpEvents)
      .values({
        id: newId(),
        userId,
        source: 'workout',
        amount: xp.total,
        referenceId: session.workoutId,
        breakdown: xp,
      })
      .onConflictDoNothing();

    for (const row of questRows) {
      const increment = questProgressFrom(row.questKey as QuestKey, {
        completedSets: session.completedSets,
        volumeKg: dec(session.volumeKg),
        durationMinutes: session.durationMinutes,
        distinctExercises: session.distinctExercises,
        personalRecords: session.personalRecords,
      });
      if (increment <= 0) continue;

      const progress = row.progress + increment;
      const nowComplete = questComplete(progress, row.target);

      await tx
        .update(dailyQuestsTable)
        .set({
          progress,
          completedAt: row.completedAt ?? (nowComplete ? now : null),
        })
        .where(eq(dailyQuestsTable.id, row.id));

      if (nowComplete && row.completedAt === null) {
        completedNow.push(toQuest({ ...row, progress, completedAt: now }));
      }
    }
  });

  // Badges are checked against the state *after* the XP landed, so a level-gated
  // badge can be earned by the same session that caused the level.
  const after = await gatherFacts(db, userId, today);
  const levelAfter = levelFromXp(after.totalXp).level;
  const alreadyEarned = await earnedBadgeKeys(db, userId);
  const newBadges = detectBadges(badgeContextFrom(after, levelAfter), alreadyEarned);

  if (newBadges.length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .insert(userBadges)
        .values(newBadges.map((badge) => ({ userId, badgeKey: badge.key, earnedAt: now })))
        .onConflictDoNothing();

      for (const badge of newBadges) {
        await tx
          .insert(xpEvents)
          .values({
            id: newId(),
            userId,
            source: 'badge',
            amount: badge.xp,
            referenceId: badge.key,
          })
          .onConflictDoNothing();
      }
    });
  }

  // Re-read once more so the level shown accounts for badge XP too.
  const final = await gatherFacts(db, userId, today);
  const finalLevel = levelFromXp(final.totalXp).level;

  return {
    xp,
    levelBefore,
    levelAfter: finalLevel,
    rankBefore: rankForLevel(levelBefore),
    rankAfter: rankForLevel(finalLevel),
    leveledUp: finalLevel > levelBefore,
    rankedUp: rankForLevel(finalLevel) !== rankForLevel(levelBefore),
    badgesEarned: newBadges.map((badge) => ({
      key: badge.key,
      name: badge.name,
      requirement: badge.requirement,
      tier: badge.tier,
      xp: badge.xp,
      earned: true,
      earnedAt: now.toISOString(),
    })),
    questsCompleted: completedNow,
    statsBefore,
    statsAfter: statsFrom(final),
  };
}
// ---------------------------------------------------------------- leaderboard --

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  totalXp: number;
  volumeKg: string;
  workouts: number;
  streakDays: number;
}

/**
 * The leaderboard (opt-in only).
 *
 * Only profiles with  appear, and a viewer who has not opted
 * in sees the board but is absent from it — visible, not participating.
 *
 * Built from three grouped queries joined in memory rather than correlated
 * subqueries: the board is capped at a hundred rows, and the query builder
 * keeps the whole thing type-checked.
 */
export async function leaderboard(
  db: Database,
  userId: string,
  window: 'week' | 'month' | 'all',
  /** The viewer's local date, used only to bound the window. */
  today: string,
): Promise<{ entries: LeaderboardRow[]; optedIn: boolean }> {
  const participants = await db
    .select({ userId: userProfiles.userId, displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.leaderboardOptIn, true))
    .limit(100);

  const optedIn = participants.some((row) => row.userId === userId);
  if (participants.length === 0) return { entries: [], optedIn };

  const ids = participants.map((row) => row.userId);
  const since =
    window === 'all'
      ? null
      : new Date(`${isoDateDaysAgo(today, window === 'week' ? 6 : 29)}T00:00:00Z`);

  const xpRows = await db
    .select({ userId: xpEvents.userId, total: sql<string>`sum(${xpEvents.amount})` })
    .from(xpEvents)
    .where(inArray(xpEvents.userId, ids))
    .groupBy(xpEvents.userId);

  const workoutRows = await db
    .select({
      userId: workouts.userId,
      volume: sql<string>`coalesce(sum(${workouts.totalVolumeKg}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(workouts)
    .where(
      and(
        inArray(workouts.userId, ids),
        eq(workouts.status, 'completed'),
        since ? gte(workouts.startedAt, since) : undefined,
      ),
    )
    .groupBy(workouts.userId);

  const xpByUser = new Map(xpRows.map((row) => [row.userId, Number(row.total)]));
  const workByUser = new Map(workoutRows.map((row) => [row.userId, row]));

  const entries = participants
    .map((participant) => {
      const work = workByUser.get(participant.userId);
      return {
        userId: participant.userId,
        displayName: participant.displayName,
        totalXp: xpByUser.get(participant.userId) ?? 0,
        volumeKg: Number(work?.volume ?? 0).toFixed(2),
        workouts: work?.count ?? 0,
        // A streak is a local calendar fact and cannot be computed in another
        // user's timezone, so the board reports workouts in the window instead
        // of a number that would be wrong for most of the people on it.
        streakDays: 0,
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp);

  return { entries, optedIn };
}
