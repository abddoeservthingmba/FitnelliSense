/**
 * Nutrition — FR-NUT-01..14.
 *
 * The properties worth pinning down are the ones that would quietly corrupt a
 * food diary: an entry must keep the figures it was logged with, the day's
 * total must equal the entries shown, one user must never see another's food,
 * and no target may be invented from a profile that does not support one.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Food, FoodEntry, NutritionDay, NutritionTargets } from '@fi/shared';
import {
  client,
  closeTestContext,
  createTestContext,
  describeIntegration,
  registerUser,
  truncateAll,
  type TestClient,
  type TestContext,
  type TestUser,
} from './helpers/harness';

const DATE = '2026-09-01';

/** A panel with round numbers, so the arithmetic is checkable by hand. */
const OATS = {
  barcode: '5000108000001',
  name: 'Rolled Oats',
  brand: 'Testco',
  per100g: { energyKj: 1600, proteinG: '13.00', carbsG: '60.00', fatG: '8.00' },
  servingG: '40.00',
  servingLabel: '40 g (1 serving)',
};

describeIntegration('nutrition', () => {
  let ctx: TestContext;
  let user: TestUser;
  let api: TestClient;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });
  beforeEach(async () => {
    await truncateAll(ctx.database);
    ctx.pantry.reset();
    user = await registerUser(ctx.app);
    api = client(ctx.app, user);
  });

  const logFood = async (
    body: Record<string, unknown>,
  ): Promise<{ status: number; entry: FoodEntry }> => {
    const response = await api.post('/api/v1/nutrition/entries', { id: randomUUID(), ...body });
    return { status: response.statusCode, entry: response.json<FoodEntry>() };
  };

  const day = async (date = DATE): Promise<NutritionDay> =>
    (await api.get(`/api/v1/nutrition/days/${date}`)).json<NutritionDay>();

  const oneOff = (name: string, per100g: (typeof OATS)['per100g']) => ({
    date: DATE,
    mealSlot: 'breakfast' as const,
    quantityG: '100',
    food: { name, brand: null, per100g },
  });

  // ----------------------------------------------------------------- entries --

  it('logs a food and computes its contribution', async () => {
    const { status, entry } = await logFood({
      ...oneOff('Rolled Oats', OATS.per100g),
      quantityG: '50',
    });

    expect(status).toBe(201);
    // Half of the per-100 g panel.
    expect(entry.totals).toEqual({
      energyKj: 800,
      proteinG: '6.50',
      carbsG: '30.00',
      fatG: '4.00',
    });
    expect(entry.foodName).toBe('Rolled Oats');
  });

  it('totals a day, and the total equals the entries shown', async () => {
    await logFood({ ...oneOff('Oats', OATS.per100g), quantityG: '40' });
    await logFood({
      ...oneOff('Chicken', { energyKj: 460, proteinG: '23.00', carbsG: '0.00', fatG: '1.50' }),
      mealSlot: 'lunch',
      quantityG: '200',
    });

    const today = await day();
    expect(today.entries).toHaveLength(2);

    const sumOfEntries = today.entries.reduce((total, entry) => total + entry.totals.energyKj, 0);
    expect(today.totals.energyKj).toBe(sumOfEntries);
    // 640 + 920
    expect(today.totals.energyKj).toBe(1560);
    expect(today.totals.proteinG).toBe('51.20'); // 5.20 + 46.00
  });

  it('reports every meal slot, including the empty ones', async () => {
    await logFood(oneOff('Oats', OATS.per100g));
    const today = await day();

    expect(today.byMeal.map((meal) => meal.mealSlot)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
    ]);
    const breakfast = today.byMeal.find((meal) => meal.mealSlot === 'breakfast');
    const dinner = today.byMeal.find((meal) => meal.mealSlot === 'dinner');
    expect(breakfast?.entryCount).toBe(1);
    expect(dinner?.entryCount).toBe(0);
    expect(dinner?.energyKj).toBe(0);
  });

  it('keeps days separate', async () => {
    await logFood(oneOff('Oats', OATS.per100g));
    await logFood({ ...oneOff('Oats', OATS.per100g), date: '2026-09-02' });

    expect((await day('2026-09-01')).entries).toHaveLength(1);
    expect((await day('2026-09-02')).entries).toHaveLength(1);
    expect((await day('2026-09-03')).entries).toHaveLength(0);
  });

  it('edits a quantity and the totals follow', async () => {
    const { entry } = await logFood({ ...oneOff('Oats', OATS.per100g), quantityG: '100' });
    expect(entry.totals.energyKj).toBe(1600);

    const patched = await api.patch(`/api/v1/nutrition/entries/${entry.id}`, {
      quantityG: '25',
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<FoodEntry>().totals.energyKj).toBe(400);
    expect((await day()).totals.energyKj).toBe(400);
  });

  it('deletes an entry outright rather than archiving it (FR-NUT-12)', async () => {
    const { entry } = await logFood(oneOff('Oats', OATS.per100g));
    expect((await api.del(`/api/v1/nutrition/entries/${entry.id}`)).statusCode).toBe(200);

    const today = await day();
    expect(today.entries).toHaveLength(0);
    expect(today.totals.energyKj).toBe(0);

    // And it is gone, so deleting again is a 404 rather than a second success.
    expect((await api.del(`/api/v1/nutrition/entries/${entry.id}`)).statusCode).toBe(404);
  });

  it('refuses an entry with neither a food nor figures, and one with both', async () => {
    const neither = await api.post('/api/v1/nutrition/entries', {
      id: randomUUID(),
      date: DATE,
      mealSlot: 'breakfast',
      quantityG: '100',
    });
    expect(neither.statusCode).toBe(400);

    const food = (
      await api.post('/api/v1/nutrition/foods/custom', {
        id: randomUUID(),
        name: 'Oats',
        per100g: OATS.per100g,
      })
    ).json<Food>();

    const both = await api.post('/api/v1/nutrition/entries', {
      id: randomUUID(),
      date: DATE,
      mealSlot: 'breakfast',
      quantityG: '100',
      foodId: food.id,
      food: { name: 'Oats', brand: null, per100g: OATS.per100g },
    });
    expect(both.statusCode).toBe(400);
  });

  it('rejects a zero or negative quantity', async () => {
    for (const quantityG of ['0', '-50']) {
      const response = await api.post('/api/v1/nutrition/entries', {
        id: randomUUID(),
        ...oneOff('Oats', OATS.per100g),
        quantityG,
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    }
  });

  it('rejects a panel the database would refuse, as a 400 rather than a 500', async () => {
    // Above pure fat per 100 g. Zod and the CHECK constraint must agree on the
    // bound, or this arrives as a 500.
    const response = await api.post('/api/v1/nutrition/entries', {
      id: randomUUID(),
      ...oneOff('Impossible', { energyKj: 9000, proteinG: '10', carbsG: '10', fatG: '10' }),
    });
    expect(response.statusCode).toBe(400);
  });

  // ------------------------------------------------------------- FR-NUT-03 --

  it('keeps its own figures when the food it came from changes', async () => {
    const food = (
      await api.post('/api/v1/nutrition/foods/custom', {
        id: randomUUID(),
        name: 'House Granola',
        per100g: { energyKj: 1800, proteinG: '10.00', carbsG: '60.00', fatG: '18.00' },
      })
    ).json<Food>();

    await logFood({ date: DATE, mealSlot: 'breakfast', quantityG: '100', foodId: food.id });

    // The recipe changes — the same thing Open Food Facts does under us.
    await ctx.database.db.execute(sql`
      update foods set energy_kj = 500, protein_g = 1, carbs_g = 1, fat_g = 1
      where id = ${food.id}
    `);

    // Yesterday's total still reads as it did when it was logged.
    const today = await day();
    expect(today.totals.energyKj).toBe(1800);
    expect(today.entries[0]?.per100g.energyKj).toBe(1800);
  });

  // ------------------------------------------------------------------ foods --

  it('creates a custom food and finds it by search', async () => {
    const created = await api.post('/api/v1/nutrition/foods/custom', {
      id: randomUUID(),
      name: 'Nan’s Flapjack',
      brand: null,
      per100g: OATS.per100g,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<Food>()).toMatchObject({ source: 'custom', userId: user.id });

    const found = await api.get('/api/v1/nutrition/foods?q=flapjack');
    expect(found.json<{ items: Food[] }>().items).toHaveLength(1);
  });

  it("never returns another user's custom food", async () => {
    const created = (
      await api.post('/api/v1/nutrition/foods/custom', {
        id: randomUUID(),
        name: 'Secret Recipe',
        per100g: OATS.per100g,
      })
    ).json<Food>();

    const other = await registerUser(ctx.app);
    const otherApi = client(ctx.app, other);

    const search = await otherApi.get('/api/v1/nutrition/foods?q=secret');
    expect(search.json<{ items: Food[] }>().items).toHaveLength(0);

    // And it cannot be logged by id either — 404, not 403 (NFR-S-03).
    const stolen = await otherApi.post('/api/v1/nutrition/entries', {
      id: randomUUID(),
      date: DATE,
      mealSlot: 'lunch',
      quantityG: '100',
      foodId: created.id,
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('looks up a barcode, then serves it from cache (FR-NUT-07)', async () => {
    ctx.pantry.set([OATS]);

    const first = await api.get(`/api/v1/nutrition/foods/barcode/${OATS.barcode}`);
    expect(first.statusCode).toBe(200);
    expect(first.json<Food>()).toMatchObject({
      name: 'Rolled Oats',
      barcode: OATS.barcode,
      source: 'open_food_facts',
    });
    expect(ctx.pantry.calls.barcode).toBe(1);

    const second = await api.get(`/api/v1/nutrition/foods/barcode/${OATS.barcode}`);
    expect(second.statusCode).toBe(200);
    // Cached: the source was not asked again.
    expect(ctx.pantry.calls.barcode).toBe(1);
  });

  it('degrades to a 404 when the source has nothing, so the user can type it in', async () => {
    ctx.pantry.set([]);
    const response = await api.get('/api/v1/nutrition/foods/barcode/9999999999999');
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { message: string } }>().error.message).toContain('yourself');
  });

  it('rejects something that is not a barcode', async () => {
    expect((await api.get('/api/v1/nutrition/foods/barcode/abc')).statusCode).toBe(400);
  });

  it('caches a searched food so the second search stays local', async () => {
    ctx.pantry.set([OATS]);

    const first = await api.get('/api/v1/nutrition/foods?q=oats');
    expect(first.json<{ items: Food[] }>().items).toHaveLength(1);
    expect(ctx.pantry.calls.search).toBe(1);

    // Still one row, not two — the cached copy is matched, not duplicated.
    const second = await api.get('/api/v1/nutrition/foods?q=oats');
    expect(second.json<{ items: Food[] }>().items).toHaveLength(1);
  });

  // ---------------------------------------------------------------- targets --

  it('refuses to invent a target without a bodyweight (FR-NUT-11)', async () => {
    const targets = (await api.get('/api/v1/nutrition/targets')).json<NutritionTargets>();
    expect(targets.origin).toBe('none');
    expect(targets.energyKj).toBe(0);
    expect(targets.basis).toContain('bodyweight');
  });

  it('estimates from the profile once there is a bodyweight', async () => {
    await api.patch('/api/v1/me', { bodyweightKg: '80', experience: 'intermediate' });

    const targets = (await api.get('/api/v1/nutrition/targets')).json<NutritionTargets>();
    expect(targets.origin).toBe('estimated');
    expect(targets.energyKj).toBeGreaterThan(9000);
    expect(targets.basis).toContain('not a prescription');
  });

  it('accepts an override and stops calling it an estimate', async () => {
    await api.patch('/api/v1/me', { bodyweightKg: '80' });

    const updated = await api.put('/api/v1/nutrition/targets', {
      energyKj: 9000,
      proteinG: '170.00',
      carbsG: null,
      fatG: null,
    });
    expect(updated.statusCode).toBe(200);

    const targets = updated.json<NutritionTargets>();
    expect(targets).toMatchObject({ energyKj: 9000, proteinG: '170.00', origin: 'custom' });
    // The unset fields stay derived rather than becoming zero.
    expect(Number(targets.carbsG)).toBeGreaterThan(0);
  });

  it('clears overrides and returns to the estimate', async () => {
    await api.patch('/api/v1/me', { bodyweightKg: '80' });
    await api.put('/api/v1/nutrition/targets', {
      energyKj: 9000,
      proteinG: null,
      carbsG: null,
      fatG: null,
    });

    const cleared = await api.put('/api/v1/nutrition/targets', {
      energyKj: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    });
    expect(cleared.json<NutritionTargets>().origin).toBe('estimated');
  });

  it('serves the targets alongside the day, so one request draws the screen', async () => {
    await api.patch('/api/v1/me', { bodyweightKg: '75' });
    const today = await day();
    expect(today.targets.origin).toBe('estimated');
  });

  // --------------------------------------------------------------- FR-NUT-13 --

  it('awards XP for logging, once per day however much is logged', async () => {
    const before = (await api.get(`/api/v1/hunter?today=${DATE}`)).json<{ totalXp: number }>();

    await logFood(oneOff('Oats', OATS.per100g));
    const afterFirst = (await api.get(`/api/v1/hunter?today=${DATE}`)).json<{ totalXp: number }>();
    expect(afterFirst.totalXp).toBeGreaterThan(before.totalXp);

    await logFood({ ...oneOff('Oats', OATS.per100g), mealSlot: 'lunch' });
    const afterSecond = (await api.get(`/api/v1/hunter?today=${DATE}`)).json<{ totalXp: number }>();
    // Second entry on the same day pays nothing more.
    expect(afterSecond.totalXp).toBe(afterFirst.totalXp);

    // A different day pays again.
    await logFood({ ...oneOff('Oats', OATS.per100g), date: '2026-09-02' });
    const afterNextDay = (await api.get(`/api/v1/hunter?today=${DATE}`)).json<{ totalXp: number }>();
    expect(afterNextDay.totalXp).toBeGreaterThan(afterSecond.totalXp);
  });

  // --------------------------------------------------------------- FR-NUT-14 --

  it('includes nutrition in the data export', async () => {
    await api.post('/api/v1/nutrition/foods/custom', {
      id: randomUUID(),
      name: 'Exported Food',
      per100g: OATS.per100g,
    });
    await logFood(oneOff('Oats', OATS.per100g));

    const exported = await api.get('/api/v1/me/export');
    expect(exported.statusCode).toBe(200);

    const body = exported.json<{ foodEntries: unknown[]; customFoods: unknown[] }>();
    expect(body.foodEntries).toHaveLength(1);
    expect(body.customFoods).toHaveLength(1);
  });

  it('takes nutrition with the account when the row is finally removed', async () => {
    await logFood(oneOff('Oats', OATS.per100g));
    await api.post('/api/v1/nutrition/foods/custom', {
      id: randomUUID(),
      name: 'Doomed Food',
      per100g: OATS.per100g,
    });

    // FR-AUTH-10 is a *soft* delete: the account is anonymised now and the row
    // is removed by the grace-period job (NFR-B-05). So the entries are still
    // there immediately afterwards, by design.
    expect((await api.del('/api/v1/me')).statusCode).toBe(200);
    const afterSoftDelete = await ctx.database.db.execute(
      sql`select count(*)::int as n from food_entries`,
    );
    expect((afterSoftDelete as unknown as { n: number }[])[0]?.n).toBe(1);

    // What FR-NUT-14 actually requires is that nothing is left orphaned when
    // the row does go. That is the FK cascade, so exercise it directly rather
    // than trusting the declaration.
    await ctx.database.db.execute(sql`delete from users where id = ${user.id}`);

    for (const table of ['food_entries', 'foods']) {
      const remaining = await ctx.database.db.execute(
        sql`select count(*)::int as n from ${sql.identifier(table)}`,
      );
      expect((remaining as unknown as { n: number }[])[0]?.n).toBe(0);
    }
  });

  it('requires a session for every nutrition route', async () => {
    const anonymous = client(ctx.app);
    // The POST body is deliberately *valid*: Fastify validates before route
    // preHandlers, so an invalid body would come back 400 and this test would
    // pass without ever reaching the auth check it exists to prove.
    for (const call of [
      anonymous.get(`/api/v1/nutrition/days/${DATE}`),
      anonymous.get('/api/v1/nutrition/targets'),
      anonymous.get('/api/v1/nutrition/foods?q=oats'),
      anonymous.get(`/api/v1/nutrition/foods/barcode/${OATS.barcode}`),
      anonymous.post('/api/v1/nutrition/entries', {
        id: randomUUID(),
        ...oneOff('Oats', OATS.per100g),
      }),
    ]) {
      expect((await call).statusCode).toBe(401);
    }
  });
});
