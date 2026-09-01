/**
 * Hunter System routes.
 *
 * `today` is a query parameter on every read, because a day boundary and a
 * streak are local calendar facts — the same reason `/progress/summary` takes
 * one. The server never guesses a timezone.
 */
import { z } from 'zod';
import {
  badgeCollectionSchema,
  claimQuestResponseSchema,
  hunterStatusSchema,
  leaderboardQuerySchema,
  leaderboardSchema,
  questBoardSchema,
  rankSchema,
  uuidSchema,
} from '@fi/shared';
import { levelFromXp, rankForLevel } from '@fi/domain';
import { currentUser } from '../plugins/auth';
import * as hunter from '../services/hunter-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const todayQuery = z.object({ today: z.iso.date().optional() });

/** The client's local date, or the server's as a last resort. */
function resolveToday(supplied: string | undefined): string {
  return supplied ?? new Date().toISOString().slice(0, 10);
}

export async function hunterRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = app.ctx.database.db;

  typed.get(
    '/hunter',
    {
      preHandler: app.requireUser,
      schema: { querystring: todayQuery, response: { 200: hunterStatusSchema } },
    },
    async (request) =>
      hunter.hunterStatus(db, currentUser(request).id, resolveToday(request.query.today)),
  );

  typed.get(
    '/hunter/quests',
    {
      preHandler: app.requireUser,
      schema: { querystring: todayQuery, response: { 200: questBoardSchema } },
    },
    async (request) =>
      hunter.questBoard(db, currentUser(request).id, resolveToday(request.query.today)),
  );

  typed.post(
    '/hunter/quests/:questId/claim',
    {
      preHandler: app.requireUser,
      schema: {
        params: z.object({ questId: uuidSchema }),
        querystring: todayQuery,
        response: { 200: claimQuestResponseSchema },
      },
    },
    async (request) => {
      const userId = currentUser(request).id;
      const today = resolveToday(request.query.today);

      const before = await hunter.hunterStatus(db, userId, today);
      const claimed = await hunter.claimQuest(db, userId, request.params.questId);
      const status = await hunter.hunterStatus(db, userId, today);

      return {
        quest: claimed.quest,
        xpAwarded: claimed.xpAwarded,
        status,
        leveledUp: status.level > before.level,
      };
    },
  );

  typed.get(
    '/hunter/badges',
    {
      preHandler: app.requireUser,
      schema: { querystring: todayQuery, response: { 200: badgeCollectionSchema } },
    },
    async (request) =>
      hunter.badgeCollection(db, currentUser(request).id, resolveToday(request.query.today)),
  );

  /**
   * The leaderboard. Only opted-in profiles appear; a viewer who has not opted
   * in can see the board but is absent from it, which is the honest reading of
   * "opt in to compete".
   */
  typed.get(
    '/hunter/leaderboard',
    {
      preHandler: app.requireUser,
      schema: {
        querystring: leaderboardQuerySchema.extend({ today: z.iso.date().optional() }),
        response: { 200: leaderboardSchema },
      },
    },
    async (request) => {
      const userId = currentUser(request).id;
      const today = resolveToday(request.query.today);
      const board = await hunter.leaderboard(db, userId, request.query.window, today);

      const entries = board.entries.map((entry, index) => {
        const level = levelFromXp(entry.totalXp).level;
        return {
          rank: index + 1,
          userId: entry.userId,
          displayName: entry.displayName,
          level,
          hunterRank: rankSchema.parse(rankForLevel(level)),
          totalXp: entry.totalXp,
          volumeKg: entry.volumeKg,
          workouts: entry.workouts,
          isYou: entry.userId === userId,
        };
      });

      const mine = entries.find((entry) => entry.isYou);

      return {
        window: request.query.window,
        entries,
        yourPosition: mine?.rank ?? null,
        optedIn: board.optedIn,
      };
    },
  );
}
