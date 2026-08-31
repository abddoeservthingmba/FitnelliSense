/**
 * The golden path (BRD §1, §19.1): find an exercise, build a routine, log a
 * workout, see it in history and on the progress chart. If this test is green
 * the product works; if it is red nothing else matters.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ExerciseSummary } from '@fi/shared';
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
} from './helpers/harness.js';

describeIntegration('golden path', () => {
  let ctx: TestContext;
  let user: TestUser;
  let api: TestClient;

  beforeAll(async () => {
    ctx = await createTestContext();
    await truncateAll(ctx.database);
    await seedCatalogue(ctx);
    user = await registerUser(ctx.app);
    api = client(ctx.app, user);
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  /** The first exercise in the catalogue — used where the choice is irrelevant. */
  const anyExerciseId = async (): Promise<string> => {
    const response = await api.get('/api/v1/exercises?limit=1');
    return first(response.json<{ items: ExerciseSummary[] }>().items, 'exercise').id;
  };

  it('walks a user from an empty account to a progress chart', async () => {
    // 1. The taxonomy loads (FR-EX-03).
    const taxonomy = await api.get('/api/v1/taxonomy');
    expect(taxonomy.statusCode).toBe(200);
    expect(taxonomy.json<{ muscleGroups: unknown[] }>().muscleGroups.length).toBeGreaterThan(0);

    // 2. Search finds a seeded exercise (FR-EX-05).
    const search = await api.get('/api/v1/exercises?q=bench&limit=10');
    expect(search.statusCode).toBe(200);
    const bench = search
      .json<{ items: ExerciseSummary[] }>()
      .items.find((item) => item.name === 'Barbell Bench Press');
    if (!bench) throw new Error('the seed is missing Barbell Bench Press');

    // 3. Its detail page carries muscles and instructions (FR-EX-02, FR-EX-04).
    const detail = await api.get(`/api/v1/exercises/${bench.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ muscles: unknown[] }>().muscles.length).toBeGreaterThan(0);
    expect(detail.json<{ instructions: string | null }>().instructions).toBeTruthy();

    // 4. Build a routine from it (FR-RT-01, FR-RT-02).
    const routine = await api.post('/api/v1/routines', {
      name: 'Push Day',
      exercises: [{ exerciseId: bench.id, targetSets: 3, targetRepsMin: 5, targetRepsMax: 8 }],
    });
    expect(routine.statusCode).toBe(201);
    const routineId = routine.json<{ id: string }>().id;

    // 5. Start a workout from it; the exercise list is prefilled (FR-WK-01).
    const workoutId = randomUUID();
    const started = await api.post('/api/v1/workouts', {
      id: workoutId,
      routineId,
      startedAt: new Date('2026-08-30T17:00:00Z').toISOString(),
    });
    expect(started.statusCode).toBe(201);
    const workoutExerciseId = first(
      started.json<{ exercises: { id: string }[] }>().exercises,
      'workout exercise',
    ).id;

    // 6. Only one workout may be in progress (FR-WK-02).
    const second = await api.post('/api/v1/workouts', {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
    });
    expect(second.statusCode).toBe(409);

    // 7. It survives a reload (FR-WK-03).
    const active = await api.get('/api/v1/workouts/active');
    expect(active.statusCode).toBe(200);
    expect(active.json<{ id: string }>().id).toBe(workoutId);

    // 8. Log a warmup and two working sets (FR-WK-04, FR-WK-05).
    const loads = [
      { weightKg: '60', reps: 10, setType: 'warmup' },
      { weightKg: '90', reps: 5, setType: 'normal' },
      { weightKg: '90', reps: 4, setType: 'normal' },
    ];
    for (const load of loads) {
      const set = await api.post(
        `/api/v1/workouts/${workoutId}/exercises/${workoutExerciseId}/sets`,
        {
          id: randomUUID(),
          ...load,
          isCompleted: true,
          completedAt: new Date('2026-08-30T17:20:00Z').toISOString(),
        },
      );
      expect(set.statusCode).toBe(201);
    }

    // 9. The prefill chain suggests the previous set (FR-WK-06).
    const prefill = await api.get(
      `/api/v1/workouts/prefill?exerciseId=${bench.id}&workoutId=${workoutId}&routineId=${routineId}`,
    );
    expect(prefill.json()).toMatchObject({ weightKg: '90.00', reps: 4, origin: 'previous_set' });

    // 10. Finish it: duration, volume and records (FR-WK-10, FR-HP-06).
    const completed = await api.post(`/api/v1/workouts/${workoutId}/complete`, {
      completedAt: new Date('2026-08-30T18:00:00Z').toISOString(),
    });
    expect(completed.statusCode).toBe(200);
    const summary = completed.json<{
      workout: { durationSecs: number; totalVolumeKg: string };
      personalRecords: { prType: string; value: string }[];
    }>();

    expect(summary.workout.durationSecs).toBe(3600);
    // Warmups do not count: 90×5 + 90×4 = 810 kg.
    expect(summary.workout.totalVolumeKg).toBe('810.00');
    expect(summary.personalRecords.map((record) => record.prType).sort()).toEqual([
      'best_1rm',
      'best_set_volume',
      'heaviest_weight',
    ]);
    expect(
      summary.personalRecords.find((record) => record.prType === 'heaviest_weight')?.value,
    ).toBe('90.00');

    // 11. It appears in history with every set intact (FR-HP-01, FR-HP-02).
    const history = await api.get('/api/v1/workouts');
    expect(first(history.json<{ items: { id: string }[] }>().items, 'workout').id).toBe(workoutId);

    const stored = await api.get(`/api/v1/workouts/${workoutId}`);
    expect(
      first(stored.json<{ exercises: { sets: unknown[] }[] }>().exercises, 'exercise').sets,
    ).toHaveLength(3);

    // 12. The progress chart renders for that exercise (FR-HP-04, FR-HP-05).
    const progress = await api.get(`/api/v1/progress/exercises/${bench.id}?metric=estimated_1rm`);
    expect(progress.statusCode).toBe(200);
    const series = progress.json<{ formula: string; points: { value: string }[] }>();
    expect(series.formula).toContain('1RM');
    // Epley on the top set: 90 × (1 + 5/30) = 105.
    expect(first(series.points, 'progress point').value).toBe('105.00');

    // 13. The dashboard summarises it (FR-HP-07).
    const dashboard = await api.get('/api/v1/progress/summary?today=2026-08-30');
    expect(dashboard.json()).toMatchObject({
      workoutsThisWeek: 1,
      currentStreakDays: 1,
      volume7dKg: '810.00',
    });

    // 14. And the workout can become a routine again (FR-HP-03).
    const derived = await api.post('/api/v1/routines/from-workout', {
      workoutId,
      name: 'Push Day (repeat)',
    });
    expect(derived.statusCode).toBe(201);
    expect(derived.json<{ exercises: unknown[] }>().exercises).toHaveLength(1);
  });

  it('keeps one account out of another account’s data (NFR-S-03)', async () => {
    const stranger = client(ctx.app, await registerUser(ctx.app));
    const mine = await api.post('/api/v1/routines', {
      name: 'Private',
      exercises: [{ exerciseId: await anyExerciseId() }],
    });

    const theirs = await stranger.get(`/api/v1/routines/${mine.json<{ id: string }>().id}`);
    // 404, not 403: an ownership failure must not confirm the row exists.
    expect(theirs.statusCode).toBe(404);
  });

  it('replays an idempotent mutation instead of repeating it (NFR-R-03)', async () => {
    const key = `test-${randomUUID()}`;
    const payload = { name: 'Idempotent', exercises: [{ exerciseId: await anyExerciseId() }] };

    const firstCall = await api.post('/api/v1/routines', payload, { 'idempotency-key': key });
    const replay = await api.post('/api/v1/routines', payload, { 'idempotency-key': key });

    expect(firstCall.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json<{ id: string }>().id).toBe(firstCall.json<{ id: string }>().id);

    // The same key with a different body is a client bug, and says so.
    const conflicting = await api.post(
      '/api/v1/routines',
      { ...payload, name: 'Something else' },
      { 'idempotency-key': key },
    );
    expect(conflicting.statusCode).toBe(409);
  });

  it('keeps a custom exercise private and archives rather than deletes it', async () => {
    const created = await api.post('/api/v1/exercises', {
      name: 'My Weird Machine Press',
      muscles: [{ muscleId: 1, role: 'primary' }],
    });
    expect(created.statusCode).toBe(201);
    const exerciseId = created.json<{ id: string }>().id;

    const stranger = client(ctx.app, await registerUser(ctx.app));
    expect((await stranger.get(`/api/v1/exercises/${exerciseId}`)).statusCode).toBe(404);

    expect((await api.del(`/api/v1/exercises/${exerciseId}`)).statusCode).toBe(200);

    // Still retrievable, so historical workouts never break (FR-EX-09).
    const afterArchive = await api.get(`/api/v1/exercises/${exerciseId}`);
    expect(afterArchive.statusCode).toBe(200);
    expect(afterArchive.json<{ archivedAt: string | null }>().archivedAt).toBeTruthy();
  });

  it('hides the admin namespace from a normal account (FR-ADM-01)', async () => {
    expect((await api.get('/api/v1/admin/exercises')).statusCode).toBe(404);
  });

  it('rejects an inverted rep range at the boundary (NFR-S-05)', async () => {
    const response = await api.post('/api/v1/routines', {
      name: 'Broken',
      exercises: [{ exerciseId: await anyExerciseId(), targetRepsMin: 12, targetRepsMax: 8 }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('discards an in-progress workout on request (FR-WK-11)', async () => {
    const workoutId = randomUUID();
    await api.post('/api/v1/workouts', { id: workoutId, startedAt: new Date().toISOString() });

    expect((await api.post(`/api/v1/workouts/${workoutId}/discard`)).statusCode).toBe(200);
    expect((await api.get('/api/v1/workouts/active')).statusCode).toBe(404);
  });

  it('updates a set and reflects it immediately', async () => {
    const workoutId = randomUUID();
    const weId = randomUUID();
    const setId = randomUUID();

    await api.post('/api/v1/workouts', { id: workoutId, startedAt: new Date().toISOString() });
    await api.post(`/api/v1/workouts/${workoutId}/exercises`, {
      id: weId,
      exerciseId: await anyExerciseId(),
    });
    await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
      id: setId,
      weightKg: '40',
      reps: 10,
    });

    const updated = await api.patch(`/api/v1/sets/${setId}`, { reps: 12, isCompleted: true });
    expect(updated.statusCode).toBe(200);
    const exercise = first(
      updated.json<{ exercises: { sets: { reps: number; isCompleted: boolean }[] }[] }>().exercises,
      'exercise',
    );
    expect(first(exercise.sets, 'set')).toMatchObject({ reps: 12, isCompleted: true });

    await api.post(`/api/v1/workouts/${workoutId}/discard`);
  });
});
