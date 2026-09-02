/**
 * Training insights — FR-AI-04, FR-AI-09.
 *
 * The properties worth pinning down are the ones that would make the screen
 * lie: volume attributed to the wrong muscle, a set counted twice by the
 * muscle-group join, or a comparison drawn against a window that overlaps the
 * one it is comparing.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { ExerciseSummary, TrainingInsights } from '@fi/shared';
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

describeIntegration('training insights', () => {
  let ctx: TestContext;
  let user: TestUser;
  let api: TestClient;
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
    // A fresh account each test, so one test's history cannot leak into the
    // next one's comparison window.
    user = await registerUser(ctx.app);
    api = client(ctx.app, user);
    const list = await api.get('/api/v1/exercises?q=Barbell%20Bench%20Press&limit=1');
    benchId = first(list.json<{ items: ExerciseSummary[] }>().items, 'exercise').id;
  });

  /** Logs one completed session on `date`. */
  const logSession = async (
    date: string,
    sets: { weightKg: string; reps: number }[],
    exerciseId = benchId,
  ) => {
    const workoutId = randomUUID();
    await api.post('/api/v1/workouts', { id: workoutId, startedAt: `${date}T09:00:00Z` });
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
    await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: `${date}T10:00:00Z`,
    });
  };

  const insights = async (window = '30d'): Promise<TrainingInsights> =>
    (await api.get(`/api/v1/insights?window=${window}&today=${TODAY}`)).json<TrainingInsights>();

  it('reports nothing, and says so, with no history at all', async () => {
    const data = await insights();
    expect(data.hasEnoughData).toBe(false);
    expect(data.muscles).toEqual([]);
    expect(data.totals.volumeKg).toBe('0.00');
    expect(data.insights).toEqual([]);
  });

  it('attributes volume to the primary muscle group', async () => {
    await logSession('2026-09-10', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);

    const data = await insights();
    expect(data.hasEnoughData).toBe(true);
    expect(data.muscles.length).toBeGreaterThan(0);
    // A bench press is chest work. It must not be filed under arms.
    expect(data.muscles[0]?.group.toLowerCase()).toContain('chest');
  });

  it('does not double-count a set because of the muscle-group join', async () => {
    // 100 kg x 5 = 500 kg per session, twice. The join repeats each row once
    // per primary muscle group, so a naive sum reports a multiple of the truth.
    await logSession('2026-09-10', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);

    const data = await insights();
    expect(Number(data.totals.volumeKg)).toBe(1000);
    expect(data.totals.sets).toBe(2);
  });

  it('compares against the previous window, without the two overlapping', async () => {
    await logSession('2026-09-10', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-08-10', [{ weightKg: '80', reps: 5 }]);

    const data = await insights();
    expect(data.totals.workouts).toBe(2);
    expect(data.totals.previousWorkouts).toBe(1);
    expect(Number(data.totals.volumeKg)).toBe(1000);
    expect(Number(data.totals.previousVolumeKg)).toBe(400);
    // Neither window may claim the same day as the other.
    expect(data.previousTo < data.from).toBe(true);
  });

  it('shows a group trained only in the earlier window as a change, not as absent', async () => {
    await logSession('2026-08-10', [{ weightKg: '80', reps: 5 }]);
    await logSession('2026-08-12', [{ weightKg: '80', reps: 5 }]);
    await logSession('2026-09-10', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);

    const data = await insights();
    const chest = data.muscles.find((muscle) => muscle.group.toLowerCase().includes('chest'));
    expect(Number(chest?.previousVolumeKg)).toBe(800);
    expect(Number(chest?.deltaVolumeKg)).toBe(200);
    expect(chest?.changePercent).toBe(25);
  });

  it('excludes warmups, exactly as everywhere else volume is counted', async () => {
    const workoutId = randomUUID();
    await api.post('/api/v1/workouts', { id: workoutId, startedAt: '2026-09-10T09:00:00Z' });
    const weId = randomUUID();
    await api.post(`/api/v1/workouts/${workoutId}/exercises`, { id: weId, exerciseId: benchId });
    await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
      id: randomUUID(),
      weightKg: '60',
      reps: 10,
      setType: 'warmup',
      isCompleted: true,
    });
    await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
      id: randomUUID(),
      weightKg: '100',
      reps: 5,
      isCompleted: true,
    });
    await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: '2026-09-10T10:00:00Z',
    });
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);

    const data = await insights();
    // The 600 kg warmup is not in it.
    expect(Number(data.totals.volumeKg)).toBe(1000);
    expect(data.totals.sets).toBe(2);
  });

  it('gives shares that sum to the whole window', async () => {
    await logSession('2026-09-10', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);

    const data = await insights();
    const total = data.muscles.reduce((sum, muscle) => sum + muscle.sharePercent, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(1);
  });

  it('honours the window length', async () => {
    // 40 days before TODAY: inside 90d, outside 30d.
    await logSession('2026-08-11', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-08-12', [{ weightKg: '100', reps: 5 }]);

    expect(Number((await insights('14d')).totals.volumeKg)).toBe(0);
    expect(Number((await insights('90d')).totals.volumeKg)).toBe(1000);
  });

  it('requires a session', async () => {
    const anonymous = client(ctx.app);
    expect((await anonymous.get('/api/v1/insights')).statusCode).toBe(401);
  });

  it('keeps one account out of another account insights', async () => {
    await logSession('2026-09-10', [{ weightKg: '100', reps: 5 }]);
    await logSession('2026-09-15', [{ weightKg: '100', reps: 5 }]);

    const other = client(ctx.app, await registerUser(ctx.app));
    const theirs = (
      await other.get(`/api/v1/insights?window=30d&today=${TODAY}`)
    ).json<TrainingInsights>();

    expect(theirs.totals.volumeKg).toBe('0.00');
    expect(theirs.muscles).toEqual([]);
  });
});
