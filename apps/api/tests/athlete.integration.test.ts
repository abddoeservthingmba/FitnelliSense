/**
 * Athlete profiles — FR-LB-08, NFR-S-03.
 *
 * This endpoint publishes one user's training to another, so the tests that
 * matter are the ones about who is allowed to see what. A profile exists only
 * for someone who turned the leaderboard on; everyone else is a 404, including
 * an id that is not an account at all, so the endpoint cannot be walked to find
 * out who has an account here.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { AthleteProfile, ExerciseSummary } from '@fi/shared';
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

const TODAY = '2026-09-20';

describeIntegration('athlete profiles', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;
  let aliceApi: TestClient;
  let bobApi: TestClient;
  let benchId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await truncateAll(ctx.database);
    await seedCatalogue(ctx);
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  beforeEach(async () => {
    alice = await registerUser(ctx.app);
    bob = await registerUser(ctx.app);
    aliceApi = client(ctx.app, alice);
    bobApi = client(ctx.app, bob);

    const list = await aliceApi.get('/api/v1/exercises?q=Barbell%20Bench%20Press&limit=1');
    benchId = first(list.json<{ items: ExerciseSummary[] }>().items, 'exercise').id;
  });

  const logSession = async (api: TestClient, date: string, weightKg: string, reps: number) => {
    const workoutId = randomUUID();
    await api.post('/api/v1/workouts', { id: workoutId, startedAt: `${date}T09:00:00Z` });
    const weId = randomUUID();
    await api.post(`/api/v1/workouts/${workoutId}/exercises`, { id: weId, exerciseId: benchId });
    await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
      id: randomUUID(),
      weightKg,
      reps,
      isCompleted: true,
    });
    await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: `${date}T10:00:00Z`,
    });
  };

  /** Asserted, not fired and forgotten: a silently-failing opt-in would make
   *  every "can see it" test pass for the wrong reason. */
  const optIn = async (api: TestClient) => {
    const response = await api.patch('/api/v1/me', { leaderboardOptIn: true });
    expect(response.statusCode).toBe(200);
  };

  const profileOf = (api: TestClient, userId: string) =>
    api.get(`/api/v1/hunter/athletes/${userId}?window=month&today=${TODAY}`);

  it('404s for an athlete who has not opted in', async () => {
    // Not 403. A 403 would confirm the account exists.
    await logSession(aliceApi, '2026-09-10', '100', 5);
    expect((await profileOf(bobApi, alice.id)).statusCode).toBe(404);
  });

  it('404s for an id that is not an account at all', async () => {
    // The same answer as "exists but private", which is the point.
    expect((await profileOf(bobApi, randomUUID())).statusCode).toBe(404);
  });

  it('serves a profile once the athlete opts in', async () => {
    await optIn(aliceApi);
    await logSession(aliceApi, '2026-09-10', '100', 5);

    const response = await profileOf(bobApi, alice.id);
    expect(response.statusCode).toBe(200);
    const data = response.json<AthleteProfile>();
    expect(data.athlete.userId).toBe(alice.id);
    expect(Number(data.athlete.volumeKg)).toBe(500);
    expect(data.isYou).toBe(false);
  });

  it('stops serving it again when the athlete opts back out', async () => {
    await optIn(aliceApi);
    expect((await profileOf(bobApi, alice.id)).statusCode).toBe(200);

    await aliceApi.patch('/api/v1/me', { leaderboardOptIn: false });
    expect((await profileOf(bobApi, alice.id)).statusCode).toBe(404);
  });

  it('never returns anything the opt-in did not cover', async () => {
    await optIn(aliceApi);
    await aliceApi.patch('/api/v1/me', { bodyweightKg: '82.5' });
    await logSession(aliceApi, '2026-09-10', '100', 5);

    const body = (await profileOf(bobApi, alice.id)).payload;
    // Bodyweight is health data about a person's body; an opt-in to being
    // ranked on training is not consent to publish it.
    expect(body).not.toContain('82.5');
    expect(body).not.toContain('bodyweight');
    expect(body).not.toContain(alice.email);
  });

  it('returns the viewer own figures over the same window', async () => {
    await optIn(aliceApi);
    await logSession(aliceApi, '2026-09-10', '100', 5);
    await logSession(bobApi, '2026-09-11', '60', 5);

    const data = (await profileOf(bobApi, alice.id)).json<AthleteProfile>();
    expect(Number(data.athlete.volumeKg)).toBe(500);
    expect(Number(data.you?.volumeKg)).toBe(300);
  });

  it('does not require the viewer to have opted in to look', async () => {
    // Bob is not on the board. Reading it without joining is already allowed,
    // and profiles follow the same rule.
    await optIn(aliceApi);
    await logSession(aliceApi, '2026-09-10', '100', 5);
    expect((await profileOf(bobApi, alice.id)).statusCode).toBe(200);
  });

  it('gives no comparison when you look at yourself', async () => {
    await optIn(aliceApi);
    await logSession(aliceApi, '2026-09-10', '100', 5);

    const data = (await profileOf(aliceApi, alice.id)).json<AthleteProfile>();
    expect(data.isYou).toBe(true);
    expect(data.you).toBeNull();
  });

  it('attributes the muscle split to the primary group', async () => {
    await optIn(aliceApi);
    await logSession(aliceApi, '2026-09-10', '100', 5);

    const data = (await profileOf(bobApi, alice.id)).json<AthleteProfile>();
    expect(data.athlete.muscles[0]?.group.toLowerCase()).toContain('chest');
    // The muscle-group join repeats a set once per group; a naive sum here
    // would report a multiple of the real volume.
    const total = data.athlete.muscles.reduce((sum, muscle) => sum + Number(muscle.volumeKg), 0);
    expect(total).toBeCloseTo(500, 1);
  });

  it('requires a session', async () => {
    await optIn(aliceApi);
    const anonymous = client(ctx.app);
    expect((await anonymous.get(`/api/v1/hunter/athletes/${alice.id}`)).statusCode).toBe(401);
  });

  it('rejects an id that is not a uuid', async () => {
    expect((await bobApi.get('/api/v1/hunter/athletes/not-a-uuid')).statusCode).toBe(400);
  });
});
