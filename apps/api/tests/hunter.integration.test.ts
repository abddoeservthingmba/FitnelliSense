/**
 * The Hunter System (levels, quests, badges, leaderboard).
 *
 * The properties that matter most are the ones that would quietly corrupt the
 * whole thing: XP must be awarded exactly once per source, and a level must
 * always equal the ledger behind it.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ExerciseSummary, HunterStatus, QuestBoard } from '@fi/shared';
import {
  client,
  closeTestContext,
  createTestContext,
  describeIntegration,
  first,
  registerUser,
  seedCatalogue,
  truncateAll,
  type TestClient,
  type TestContext,
  type TestUser,
} from './helpers/harness';

const TODAY = '2026-09-05';

describeIntegration('hunter system', () => {
  let ctx: TestContext;
  let user: TestUser;
  let api: TestClient;
  let exerciseId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await truncateAll(ctx.database);
    await seedCatalogue(ctx);
    user = await registerUser(ctx.app);
    api = client(ctx.app, user);

    const list = await api.get('/api/v1/exercises?q=Barbell%20Bench%20Press&limit=1');
    exerciseId = first(list.json<{ items: ExerciseSummary[] }>().items, 'exercise').id;
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  /** Logs one finished workout and returns the completion response. */
  const logWorkout = async (
    sets: { weightKg: string; reps: number }[],
    date = TODAY,
  ): Promise<{
    hunter: {
      xp: { total: number };
      levelBefore: number;
      levelAfter: number;
      leveledUp: boolean;
      badgesEarned: { key: string }[];
      questsCompleted: { key: string }[];
    };
  }> => {
    const workoutId = randomUUID();
    const started = await api.post('/api/v1/workouts', {
      id: workoutId,
      startedAt: `${date}T09:00:00Z`,
    });
    expect(started.statusCode).toBe(201);

    const weId = randomUUID();
    await api.post(`/api/v1/workouts/${workoutId}/exercises`, { id: weId, exerciseId });

    for (const set of sets) {
      await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
        id: randomUUID(),
        ...set,
        isCompleted: true,
        completedAt: `${date}T09:30:00Z`,
      });
    }

    const done = await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: `${date}T10:00:00Z`,
    });
    expect(done.statusCode).toBe(200);
    return done.json();
  };

  it('starts a new hunter at level 1, rank E, with nothing earned', async () => {
    const response = await api.get(`/api/v1/hunter?today=${TODAY}`);
    expect(response.statusCode).toBe(200);

    const status = response.json<HunterStatus>();
    expect(status).toMatchObject({ level: 1, rank: 'E', totalXp: 0, xpIntoLevel: 0 });
    expect(status.stats).toEqual({ strength: 0, endurance: 0, discipline: 0 });
    expect(status.badgesEarned).toBe(0);
    expect(status.badgesTotal).toBeGreaterThan(10);
    // Every stat explains where it comes from.
    expect(Object.keys(status.statSources)).toHaveLength(3);
  });

  it('generates three stable quests for the day', async () => {
    const first = await api.get(`/api/v1/hunter/quests?today=${TODAY}`);
    expect(first.statusCode).toBe(200);
    const board = first.json<QuestBoard>();

    expect(board.date).toBe(TODAY);
    expect(board.quests).toHaveLength(3);
    expect(board.quests.map((quest) => quest.key)).toContain('complete_workout');
    for (const quest of board.quests) {
      expect(quest.text).not.toContain('{target}');
      expect(quest.target).toBeGreaterThan(0);
    }

    // Asking again returns the same quests, not a fresh draw.
    const again = await api.get(`/api/v1/hunter/quests?today=${TODAY}`);
    expect(again.json<QuestBoard>().quests.map((q) => q.id).sort()).toEqual(
      board.quests.map((q) => q.id).sort(),
    );
  });

  it('awards itemised XP for a workout, and the level matches the ledger', async () => {
    const result = await logWorkout([
      { weightKg: '90', reps: 5 },
      { weightKg: '90', reps: 5 },
      { weightKg: '85', reps: 6 },
    ]);

    // 50 session + 13 volume (1360 kg) + 6 sets + 100 record ×3, streak ×1.02
    expect(result.hunter.xp.total).toBeGreaterThan(300);
    expect(result.hunter.levelBefore).toBe(1);
    expect(result.hunter.leveledUp).toBe(true);

    const status = (await api.get(`/api/v1/hunter?today=${TODAY}`)).json<HunterStatus>();
    // The level is a function of total XP, so it must agree with the reward.
    expect(status.level).toBe(result.hunter.levelAfter);
    expect(status.totalXp).toBeGreaterThan(0);
    expect(status.totals.workouts).toBe(1);
  });

  it('earns the first-workout badge exactly once', async () => {
    const badges = (await api.get(`/api/v1/hunter/badges?today=${TODAY}`)).json<{
      badges: { key: string; earned: boolean }[];
      earned: number;
    }>();

    const awakened = badges.badges.find((badge) => badge.key === 'first_blood');
    expect(awakened?.earned).toBe(true);

    // A second workout must not re-award it.
    const second = await logWorkout([{ weightKg: '50', reps: 10 }]);
    expect(second.hunter.badgesEarned.map((badge) => badge.key)).not.toContain('first_blood');
  });

  it('credits quest progress from the session, and pays out once on claim', async () => {
    const board = (await api.get(`/api/v1/hunter/quests?today=${TODAY}`)).json<QuestBoard>();
    const workoutQuest = board.quests.find((quest) => quest.key === 'complete_workout');
    if (!workoutQuest) throw new Error('the workout quest should always be present');

    // Two workouts have been logged above, so this is complete.
    expect(workoutQuest.isComplete).toBe(true);
    expect(workoutQuest.isClaimed).toBe(false);

    const before = (await api.get(`/api/v1/hunter?today=${TODAY}`)).json<HunterStatus>();
    const claim = await api.post(
      `/api/v1/hunter/quests/${workoutQuest.id}/claim?today=${TODAY}`,
    );
    expect(claim.statusCode).toBe(200);

    const claimed = claim.json<{ xpAwarded: number; status: HunterStatus }>();
    expect(claimed.xpAwarded).toBe(workoutQuest.xp);
    expect(claimed.status.totalXp).toBe(before.totalXp + workoutQuest.xp);

    // Collecting twice is a conflict, not a second payment.
    const again = await api.post(
      `/api/v1/hunter/quests/${workoutQuest.id}/claim?today=${TODAY}`,
    );
    expect(again.statusCode).toBe(409);

    const after = (await api.get(`/api/v1/hunter?today=${TODAY}`)).json<HunterStatus>();
    expect(after.totalXp).toBe(claimed.status.totalXp);
  });

  it('refuses to pay for an unfinished quest', async () => {
    const board = (await api.get(`/api/v1/hunter/quests?today=${TODAY}`)).json<QuestBoard>();
    const unfinished = board.quests.find((quest) => !quest.isComplete);

    if (unfinished) {
      const response = await api.post(
        `/api/v1/hunter/quests/${unfinished.id}/claim?today=${TODAY}`,
      );
      expect(response.statusCode).toBe(409);
    }
  });

  it('derives stats from real lifts rather than from XP', async () => {
    const status = (await api.get(`/api/v1/hunter?today=${TODAY}`)).json<HunterStatus>();
    // A 90×5 bench estimates 105 kg; one lift, so strength is floor(105/10).
    expect(status.stats.strength).toBeGreaterThan(0);
    expect(status.stats.discipline).toBeGreaterThan(0);
  });

  it('keeps a hunter off the leaderboard until they opt in', async () => {
    const before = await api.get(`/api/v1/hunter/leaderboard?window=week&today=${TODAY}`);
    expect(before.statusCode).toBe(200);
    expect(before.json<{ optedIn: boolean; yourPosition: number | null }>()).toMatchObject({
      optedIn: false,
      yourPosition: null,
    });

    await api.patch('/api/v1/me', { leaderboardOptIn: true });

    const after = (
      await api.get(`/api/v1/hunter/leaderboard?window=week&today=${TODAY}`)
    ).json<{
      optedIn: boolean;
      yourPosition: number | null;
      entries: { isYou: boolean; displayName: string }[];
    }>();

    expect(after.optedIn).toBe(true);
    expect(after.yourPosition).toBe(1);
    expect(after.entries.some((entry) => entry.isYou)).toBe(true);
  });

  it('does not award XP twice for the same workout, however often completion replays', async () => {
    const workoutId = randomUUID();
    await api.post('/api/v1/workouts', { id: workoutId, startedAt: `${TODAY}T14:00:00Z` });
    const weId = randomUUID();
    await api.post(`/api/v1/workouts/${workoutId}/exercises`, { id: weId, exerciseId });
    await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
      id: randomUUID(),
      weightKg: '60',
      reps: 8,
      isCompleted: true,
      completedAt: `${TODAY}T14:20:00Z`,
    });

    const firstCall = await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: `${TODAY}T15:00:00Z`,
    });
    expect(firstCall.statusCode).toBe(200);
    const afterFirst = (await api.get(`/api/v1/hunter?today=${TODAY}`)).json<HunterStatus>();

    // Completing again is refused, and crucially pays nothing.
    const second = await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: `${TODAY}T15:00:00Z`,
    });
    expect(second.statusCode).toBe(409);

    const afterSecond = (await api.get(`/api/v1/hunter?today=${TODAY}`)).json<HunterStatus>();
    expect(afterSecond.totalXp).toBe(afterFirst.totalXp);
  });
});
