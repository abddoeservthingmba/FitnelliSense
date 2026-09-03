/**
 * Cross-tenant isolation (NFR-S-03).
 *
 * The single most important property of a multi-user app: one account can
 * never read or touch another's data. Everything else — rate limits, password
 * rules, security headers — is damage limitation. This is the wall.
 *
 * The approach is deliberately mechanical rather than clever. Alice creates one
 * of everything, and Bob then attempts **every** ID-addressed operation using
 * Alice's identifiers. Every one must answer 404, never 200 and never 403:
 *
 *   - 200 would be a data breach.
 *   - 403 would confirm the resource exists, which is an enumeration oracle.
 *     "Not found" is the only answer that leaks nothing (BRD §10.2).
 *
 * A new ID-addressed route is expected to be added to `attempts` below. That is
 * the point: the list is a checklist a reviewer can read against the route
 * table, not a sample.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ExerciseSummary, RoutineDetail, WorkoutDetail } from '@fi/shared';
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

const DATE = '2026-09-10';

interface Attempt {
  readonly name: string;
  readonly call: () => Promise<{ statusCode: number; body: string }>;
}

describeIntegration('cross-tenant isolation', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;
  let asAlice: TestClient;
  let asBob: TestClient;

  /** Everything Alice owns, for Bob to fail at reaching. */
  let owned: {
    workoutId: string;
    workoutExerciseId: string;
    setId: string;
    routineId: string;
    customExerciseId: string;
    foodEntryId: string;
    customFoodId: string;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await truncateAll(ctx.database);
    await seedCatalogue(ctx);

    alice = await registerUser(ctx.app);
    bob = await registerUser(ctx.app);
    asAlice = client(ctx.app, alice);
    asBob = client(ctx.app, bob);

    const catalogue = await asAlice.get('/api/v1/exercises?q=Barbell%20Bench%20Press&limit=1');
    const exerciseId = first(catalogue.json<{ items: ExerciseSummary[] }>().items, 'exercise').id;

    // --- Alice creates one of everything.
    const workoutId = randomUUID();
    await asAlice.post('/api/v1/workouts', { id: workoutId, startedAt: `${DATE}T09:00:00Z` });

    const workoutExerciseId = randomUUID();
    await asAlice.post(`/api/v1/workouts/${workoutId}/exercises`, {
      id: workoutExerciseId,
      exerciseId,
    });

    const setId = randomUUID();
    await asAlice.post(`/api/v1/workouts/${workoutId}/exercises/${workoutExerciseId}/sets`, {
      id: setId,
      weightKg: '80',
      reps: 5,
      isCompleted: true,
      completedAt: `${DATE}T09:30:00Z`,
    });

    const routine = await asAlice.post('/api/v1/routines', {
      id: randomUUID(),
      name: "Alice's routine",
      exercises: [{ id: randomUUID(), exerciseId, position: 0 }],
    });
    expect(routine.statusCode).toBe(201);

    // A custom exercise needs at least one primary muscle, so borrow one from
    // the seeded taxonomy rather than inventing an id.
    const taxonomy = await asAlice.get('/api/v1/taxonomy');
    const muscleId = first(taxonomy.json<{ muscles: { id: number }[] }>().muscles, 'muscle').id;

    const custom = await asAlice.post('/api/v1/exercises', {
      id: randomUUID(),
      name: "Alice's secret lift",
      muscles: [{ muscleId, role: 'primary' }],
    });
    expect(custom.statusCode, custom.body).toBe(201);

    const food = await asAlice.post('/api/v1/nutrition/foods/custom', {
      id: randomUUID(),
      name: "Alice's granola",
      per100g: { energyKj: 1800, proteinG: '10.00', carbsG: '60.00', fatG: '18.00' },
    });
    expect(food.statusCode).toBe(201);

    const entry = await asAlice.post('/api/v1/nutrition/entries', {
      id: randomUUID(),
      date: DATE,
      mealSlot: 'breakfast',
      quantityG: '50',
      foodId: food.json<{ id: string }>().id,
    });
    expect(entry.statusCode).toBe(201);

    owned = {
      workoutId,
      workoutExerciseId,
      setId,
      routineId: routine.json<RoutineDetail>().id,
      customExerciseId: custom.json<{ id: string }>().id,
      foodEntryId: entry.json<{ id: string }>().id,
      customFoodId: food.json<{ id: string }>().id,
    };
  });

  afterAll(async () => {
    await closeTestContext(ctx);
  });

  /**
   * Every ID-addressed operation, attempted as Bob against Alice's ids.
   *
   * Built lazily inside the test so `owned` is populated. Read this list beside
   * `routes.ts`: anything there taking an id should appear here.
   */
  const bobAttempts = (): Attempt[] => [
    // --- workouts
    { name: 'GET workout', call: () => asBob.get(`/api/v1/workouts/${owned.workoutId}`) },
    {
      name: 'POST workout complete',
      call: () =>
        asBob.post(`/api/v1/workouts/${owned.workoutId}/complete`, {
          completedAt: `${DATE}T10:00:00Z`,
        }),
    },
    {
      name: 'POST workout discard',
      call: () => asBob.post(`/api/v1/workouts/${owned.workoutId}/discard`),
    },
    {
      name: 'POST workout exercise',
      call: () =>
        asBob.post(`/api/v1/workouts/${owned.workoutId}/exercises`, {
          id: randomUUID(),
          exerciseId: owned.customExerciseId,
        }),
    },
    {
      name: 'POST set into workout',
      call: () =>
        asBob.post(
          `/api/v1/workouts/${owned.workoutId}/exercises/${owned.workoutExerciseId}/sets`,
          { id: randomUUID(), weightKg: '100', reps: 1 },
        ),
    },
    {
      name: 'DELETE workout exercise',
      call: () =>
        asBob.del(`/api/v1/workouts/${owned.workoutId}/exercises/${owned.workoutExerciseId}`),
    },
    {
      name: 'POST workout sync',
      call: () => asBob.post(`/api/v1/workouts/${owned.workoutId}/sync`, { sets: [] }),
    },

    // --- sets, addressed with no parent in the path at all
    {
      name: 'PATCH set',
      call: () => asBob.patch(`/api/v1/sets/${owned.setId}`, { reps: 99 }),
    },
    { name: 'DELETE set', call: () => asBob.del(`/api/v1/sets/${owned.setId}`) },

    // --- routines
    { name: 'GET routine', call: () => asBob.get(`/api/v1/routines/${owned.routineId}`) },
    {
      name: 'PATCH routine',
      call: () => asBob.patch(`/api/v1/routines/${owned.routineId}`, { name: 'stolen' }),
    },
    { name: 'DELETE routine', call: () => asBob.del(`/api/v1/routines/${owned.routineId}`) },
    {
      name: 'POST routine duplicate',
      call: () => asBob.post(`/api/v1/routines/${owned.routineId}/duplicate`, {}),
    },

    // --- custom exercise
    {
      name: 'GET custom exercise',
      call: () => asBob.get(`/api/v1/exercises/${owned.customExerciseId}`),
    },
    {
      name: 'PATCH custom exercise',
      call: () => asBob.patch(`/api/v1/exercises/${owned.customExerciseId}`, { name: 'stolen' }),
    },
    {
      name: 'DELETE custom exercise',
      call: () => asBob.del(`/api/v1/exercises/${owned.customExerciseId}`),
    },

    // --- nutrition
    {
      name: 'PATCH food entry',
      call: () =>
        asBob.patch(`/api/v1/nutrition/entries/${owned.foodEntryId}`, { quantityG: '999' }),
    },
    {
      name: 'DELETE food entry',
      call: () => asBob.del(`/api/v1/nutrition/entries/${owned.foodEntryId}`),
    },
    {
      name: 'POST entry referencing another user’s custom food',
      call: () =>
        asBob.post('/api/v1/nutrition/entries', {
          id: randomUUID(),
          date: DATE,
          mealSlot: 'lunch',
          quantityG: '50',
          foodId: owned.customFoodId,
        }),
    },
  ];

  it('answers 404 to every attempt on another account’s data', async () => {
    const failures: string[] = [];

    for (const attempt of bobAttempts()) {
      const response = await attempt.call();
      if (response.statusCode !== 404) {
        failures.push(`${attempt.name}: expected 404, got ${response.statusCode}`);
      }
    }

    // Reported together, so one run names every hole rather than the first.
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('leaves Alice’s data exactly as it was', async () => {
    // The real assurance: not just that Bob was refused, but that nothing
    // changed. A 404 returned *after* a write would be worse than a 200.
    const workout = await asAlice.get(`/api/v1/workouts/${owned.workoutId}`);
    expect(workout.statusCode).toBe(200);

    const detail = workout.json<WorkoutDetail>();
    expect(detail.status).toBe('in_progress');
    expect(detail.exercises).toHaveLength(1);
    expect(detail.exercises[0]?.sets).toHaveLength(1);
    expect(detail.exercises[0]?.sets[0]?.reps).toBe(5);

    const routine = await asAlice.get(`/api/v1/routines/${owned.routineId}`);
    expect(routine.statusCode).toBe(200);
    expect(routine.json<RoutineDetail>().name).toBe("Alice's routine");

    const day = await asAlice.get(`/api/v1/nutrition/days/${DATE}`);
    expect(day.json<{ entries: unknown[] }>().entries).toHaveLength(1);
  });

  it('keeps another account’s custom exercise out of search results', async () => {
    const search = await asBob.get('/api/v1/exercises?q=secret%20lift');
    const names = search.json<{ items: ExerciseSummary[] }>().items.map((item) => item.name);
    expect(names).not.toContain("Alice's secret lift");
  });

  it('keeps lists scoped, so nothing leaks without an id at all', async () => {
    // An id-guessing attack is the obvious one; a list endpoint that forgot its
    // predicate would hand everything over without needing to guess anything.
    const workouts = await asBob.get('/api/v1/workouts');
    expect(workouts.json<{ items: unknown[] }>().items).toHaveLength(0);

    const routines = await asBob.get('/api/v1/routines');
    expect(routines.json<{ items: unknown[] }>().items).toHaveLength(0);

    // This one answers `{ records: [...] }`, not `{ items: [...] }`.
    const records = await asBob.get('/api/v1/progress/records');
    expect(records.json<{ records: unknown[] }>().records).toHaveLength(0);

    const foods = await asBob.get('/api/v1/nutrition/foods?q=granola');
    expect(foods.json<{ items: unknown[] }>().items).toHaveLength(0);

    const day = await asBob.get(`/api/v1/nutrition/days/${DATE}`);
    expect(day.json<{ entries: unknown[] }>().entries).toHaveLength(0);
  });

  it('does not put an unrelated account on the leaderboard', async () => {
    // Opt-in is the rule (FR-LB-01). Neither user has opted in, so neither
    // should be able to see the other there.
    const board = await asBob.get(`/api/v1/hunter/leaderboard?window=all&today=${DATE}`);
    expect(board.statusCode).toBe(200);

    const body = board.json<{ entries: { displayName: string }[]; optedIn: boolean }>();
    expect(body.optedIn).toBe(false);
    expect(body.entries).toHaveLength(0);
  });

  it('refuses the admin namespace to an ordinary account, as 404 not 403', async () => {
    // 403 would confirm /admin exists and that the account simply lacks the
    // flag. 404 says nothing (FR-ADM-01).
    for (const path of ['/api/v1/admin/exercises', '/api/v1/admin/media']) {
      const response = await asBob.get(path);
      expect(response.statusCode).toBe(404);
    }
  });

  it('rejects a forged token, and one signed with the wrong secret', async () => {
    const forged = client(ctx.app, {
      ...bob,
      authHeader: { authorization: 'Bearer not.a.real.token' },
    });
    expect((await forged.get('/api/v1/me')).statusCode).toBe(401);

    /*
     * Alice's own access token with its signature altered: the HMAC must fail.
     *
     * The character changed is the FIRST of the signature, not the last. This
     * test used to flip the last one and failed about a quarter of the time:
     * an HMAC-SHA256 signature is 32 bytes, which base64url encodes as 43
     * characters carrying 258 bits — so the final character has two bits that
     * decode to nothing, and four different values for it produce byte-for-byte
     * identical signatures that verify perfectly.
     *
     * Every bit of the first character is significant, so this always tampers.
     */
    const [header, payload, signature] = alice.accessToken.split('.') as [string, string, string];
    const flipped = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
    const tampered = `${header}.${payload}.${flipped}`;
    const mangled = client(ctx.app, {
      ...alice,
      authHeader: { authorization: `Bearer ${tampered}` },
    });
    expect((await mangled.get('/api/v1/me')).statusCode).toBe(401);
  });
});
