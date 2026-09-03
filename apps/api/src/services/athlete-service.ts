/**
 * An athlete's public profile, and the viewer's own figures beside it —
 * FR-LB-08.
 *
 * The gate is the whole design. A profile exists here ONLY for someone who has
 * turned the leaderboard on; everyone else is a 404, not a 403, because a 403
 * confirms the account exists and turns this endpoint into a way to enumerate
 * users (NFR-S-03).
 *
 * Every figure is computed over the same window for both people, server-side,
 * so a comparison cannot be assembled from two differently-bounded requests.
 */
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  decToString,
  isoDateDaysAgo,
  levelFromXp,
  muscleWork,
  rankForLevel,
  sum,
  volumeShare,
} from '@fi/domain';
import type { AthleteProfile, AthleteStats } from '@fi/shared';
import { exercises, personalRecords, userProfiles, workouts, xpEvents } from '../db/schema';
import { notFound } from '../lib/errors';
import { fetchSets, toAttributedWork } from './insights-service';
import type { Database } from '../db/client';

/** How many records to show. Enough to characterise a lifter, not a CV. */
const MAX_RECORDS = 6;

type Window = 'week' | 'month' | 'all';

/** The window as a half-open date range, or null for all time. */
function windowFrom(window: Window, today: string): string | null {
  if (window === 'all') return null;
  return isoDateDaysAgo(today, window === 'week' ? 6 : 29);
}

async function statsFor(
  db: Database,
  userId: string,
  window: Window,
  today: string,
): Promise<AthleteStats | null> {
  const [profile] = await db
    .select({ displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!profile) return null;

  const [xp] = await db
    .select({ total: sql<string>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));

  const totalXp = Number(xp?.total ?? 0);
  const level = levelFromXp(totalXp).level;

  const from = windowFrom(window, today);
  // Exclusive upper bound of tomorrow, so today's sessions are included without
  // the window ever overlapping the next one.
  const toExclusive = isoDateDaysAgo(today, -1);

  const [totals] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        from === null ? undefined : gte(workouts.startedAt, new Date(`${from}T00:00:00Z`)),
        lt(workouts.startedAt, new Date(`${toExclusive}T00:00:00Z`)),
      ),
    );

  // The muscle split reuses the insights query and its fan-out dedupe rather
  // than restating it: the join repeats a set once per primary muscle group,
  // and getting that wrong twice in two places is how totals silently double.
  const rows = await fetchSets(db, userId, from ?? '1970-01-01', toExclusive);
  const work = muscleWork(toAttributedWork(rows));
  const shares = new Map(volumeShare(work).map((share) => [share.group, share.percent]));

  const records = await db
    .select({
      exerciseName: exercises.name,
      prType: personalRecords.prType,
      value: personalRecords.value,
      reps: personalRecords.reps,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(
      and(
        eq(personalRecords.userId, userId),
        inArray(personalRecords.prType, ['heaviest_weight', 'best_1rm']),
      ),
    )
    .orderBy(desc(personalRecords.achievedAt))
    .limit(MAX_RECORDS);

  return {
    userId,
    displayName: profile.displayName,
    level,
    hunterRank: rankForLevel(level),
    totalXp,
    workouts: totals?.count ?? 0,
    sets: work.reduce((count, group) => count + group.sets, 0),
    volumeKg: decToString(sum(work.map((group) => group.volumeKg))),
    muscles: work.map((group) => ({
      group: group.group,
      volumeKg: decToString(group.volumeKg),
      sets: group.sets,
      sharePercent: shares.get(group.group) ?? 0,
    })),
    records: records.map((record) => ({
      exerciseName: record.exerciseName,
      prType: record.prType,
      value: record.value,
      reps: record.reps,
    })),
  };
}

export async function athleteProfile(
  db: Database,
  viewerId: string,
  athleteId: string,
  window: Window,
  today: string,
): Promise<AthleteProfile> {
  const [participant] = await db
    .select({ optIn: userProfiles.leaderboardOptIn })
    .from(userProfiles)
    .where(eq(userProfiles.userId, athleteId))
    .limit(1);

  // Not opted in, or no such account: the same answer either way, so this
  // cannot be used to find out which.
  if (!participant?.optIn) throw notFound('No such athlete');

  const athlete = await statsFor(db, athleteId, window, today);
  if (athlete === null) throw notFound('No such athlete');

  const isYou = viewerId === athleteId;
  return {
    window,
    athlete,
    // Comparing someone with themselves is a column of zeroes, so it is null.
    you: isYou ? null : await statsFor(db, viewerId, window, today),
    isYou,
  };
}
