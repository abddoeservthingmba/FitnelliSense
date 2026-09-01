/**
 * Nutrition logic — FR-NUT-01..14 (BRD v0.2).
 *
 * Every query here is scoped by `user_id` (NFR-S-03), and every gram of
 * arithmetic happens in `packages/domain` (NFR-M-04). This file is plumbing:
 * fetch rows, hand them to the domain, shape the response.
 */
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  MEAL_SLOTS,
  type CreateFoodEntryRequest,
  type CreateFoodRequest,
  type Food,
  type FoodEntry,
  type MealSlot,
  type NutritionDay,
  type NutritionTargets,
  type UpdateFoodEntryRequest,
  type UpdateNutritionTargetsRequest,
} from '@fi/shared';
import {
  applyTargetOverrides,
  contributionOf,
  contributionToWire,
  dec,
  decOrNull,
  decToString,
  estimateTargets,
  sumContributions,
  XP_PER_NUTRITION_DAY,
  type Contribution,
  type Panel,
} from '@fi/domain';
import { foodEntries, foods, userProfiles, xpEvents } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { FoodLookup } from '../lib/open-food-facts';
import type { Database } from '../db/client';

export interface NutritionDeps {
  readonly db: Database;
  readonly lookup: FoodLookup;
}

// ------------------------------------------------------------------ mapping --

type FoodRow = typeof foods.$inferSelect;
type EntryRow = typeof foodEntries.$inferSelect;

function panelOf(row: { energyKj: number; proteinG: string; carbsG: string; fatG: string }): Panel {
  return {
    energyKj: row.energyKj,
    proteinG: dec(row.proteinG),
    carbsG: dec(row.carbsG),
    fatG: dec(row.fatG),
  };
}

function toFood(row: FoodRow): Food {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    source: row.source,
    userId: row.userId,
    per100g: {
      energyKj: row.energyKj,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
    },
    servingG: row.servingG,
    servingLabel: row.servingLabel,
  };
}

function toEntry(row: EntryRow): FoodEntry {
  const contribution = contributionOf(panelOf(row), dec(row.quantityG));
  return {
    id: row.id,
    date: row.entryDate,
    mealSlot: row.mealSlot,
    foodId: row.foodId,
    foodName: row.foodName,
    brand: row.brand,
    quantityG: row.quantityG,
    per100g: {
      energyKj: row.energyKj,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
    },
    // Recomputed from the snapshot rather than stored, so the entry's numbers
    // and the day's total can never disagree.
    totals: contributionToWire(contribution),
    loggedAt: row.loggedAt.toISOString(),
  };
}

// -------------------------------------------------------------------- foods --

/**
 * Searches our cache first, then Open Food Facts (FR-NUT-04, FR-NUT-07).
 *
 * Local first because it is fast, works offline, and includes the user's own
 * foods. Anything new from the source is cached on the way past, so the second
 * search for the same thing does not leave the building.
 */
export async function searchFoods(
  deps: NutritionDeps,
  userId: string,
  query: string,
  limit: number,
): Promise<Food[]> {
  const pattern = `%${query}%`;
  const local = await deps.db
    .select()
    .from(foods)
    .where(
      and(
        ilike(foods.name, pattern),
        // The catalogue plus this user's own foods, and no one else's.
        or(isNull(foods.userId), eq(foods.userId, userId)),
      ),
    )
    .orderBy(desc(foods.updatedAt))
    .limit(limit);

  if (local.length >= limit) return local.map(toFood);

  const external = await deps.lookup.search(query, limit - local.length);
  if (external.length === 0) return local.map(toFood);

  const known = new Set(local.map((row) => row.barcode).filter((code): code is string => !!code));
  const cached: Food[] = [];

  for (const item of external) {
    if (item.barcode && known.has(item.barcode)) continue;
    const stored = await cacheExternalFood(deps, item);
    if (stored) cached.push(stored);
  }

  return [...local.map(toFood), ...cached];
}

/**
 * Stores an external food, or returns the row that already holds that barcode.
 *
 * A concurrent request for the same barcode is a normal race, not an error, so
 * the insert tolerates the conflict and reads back what won.
 */
async function cacheExternalFood(
  deps: NutritionDeps,
  item: {
    barcode: string | null;
    name: string;
    brand: string | null;
    per100g: { energyKj: number; proteinG: string; carbsG: string; fatG: string };
    servingG: string | null;
    servingLabel: string | null;
  },
): Promise<Food | null> {
  const values = {
    id: newId(),
    name: item.name,
    brand: item.brand,
    barcode: item.barcode,
    source: 'open_food_facts' as const,
    userId: null,
    energyKj: item.per100g.energyKj,
    proteinG: item.per100g.proteinG,
    carbsG: item.per100g.carbsG,
    fatG: item.per100g.fatG,
    servingG: item.servingG,
    servingLabel: item.servingLabel,
    updatedAt: new Date(),
  };

  const [inserted] = await deps.db
    .insert(foods)
    .values(values)
    // `where` here is the partial index's predicate, which the conflict target
    // must repeat to match `foods_barcode_unique`.
    .onConflictDoNothing({
      target: foods.barcode,
      where: sql`user_id IS NULL AND barcode IS NOT NULL`,
    })
    .returning();

  if (inserted) return toFood(inserted);

  if (item.barcode === null) return null;
  const [existing] = await deps.db
    .select()
    .from(foods)
    .where(and(eq(foods.barcode, item.barcode), isNull(foods.userId)))
    .limit(1);

  return existing ? toFood(existing) : null;
}

/** FR-NUT-05. Cache first, then the source. */
export async function foodByBarcode(
  deps: NutritionDeps,
  userId: string,
  barcode: string,
): Promise<Food> {
  const [cachedRow] = await deps.db
    .select()
    .from(foods)
    .where(
      and(eq(foods.barcode, barcode), or(isNull(foods.userId), eq(foods.userId, userId))),
    )
    .limit(1);

  if (cachedRow) return toFood(cachedRow);

  const external = await deps.lookup.byBarcode(barcode);
  // Not found is a 404 whether the source said so or was simply unreachable.
  // The client's next move is the same either way: enter it by hand.
  if (!external) {
    throw notFound('We could not find that barcode. You can add the food yourself.');
  }

  const stored = await cacheExternalFood(deps, external);
  if (!stored) throw notFound('We could not save that food. You can add it yourself.');
  return stored;
}

/** FR-NUT-08. A custom food is private to the user who created it. */
export async function createCustomFood(
  deps: NutritionDeps,
  userId: string,
  input: CreateFoodRequest,
): Promise<Food> {
  const [created] = await deps.db
    .insert(foods)
    .values({
      id: input.id,
      name: input.name,
      brand: input.brand,
      barcode: null,
      source: 'custom',
      userId,
      energyKj: input.per100g.energyKj,
      proteinG: input.per100g.proteinG,
      carbsG: input.per100g.carbsG,
      fatG: input.per100g.fatG,
      servingG: input.servingG,
      servingLabel: input.servingLabel,
      updatedAt: new Date(),
    })
    .returning();

  if (!created) throw conflict('That food already exists');
  return toFood(created);
}

// ------------------------------------------------------------------ entries --

/** FR-NUT-01. */
export async function createEntry(
  deps: NutritionDeps,
  userId: string,
  input: CreateFoodEntryRequest,
): Promise<FoodEntry> {
  // Exactly one source of figures. Both, or neither, is a client bug worth
  // naming rather than silently resolving.
  if ((input.foodId === undefined) === (input.food === undefined)) {
    throw badRequest('Provide either a foodId or the food details, not both');
  }

  let snapshot: {
    foodId: string | null;
    foodName: string;
    brand: string | null;
    energyKj: number;
    proteinG: string;
    carbsG: string;
    fatG: string;
  };

  if (input.foodId !== undefined) {
    const [row] = await deps.db
      .select()
      .from(foods)
      .where(
        and(eq(foods.id, input.foodId), or(isNull(foods.userId), eq(foods.userId, userId))),
      )
      .limit(1);

    // Another user's custom food is "not found", not "forbidden" (NFR-S-03).
    if (!row) throw notFound('That food could not be found');

    snapshot = {
      foodId: row.id,
      foodName: row.name,
      brand: row.brand,
      energyKj: row.energyKj,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
    };
  } else {
    const food = input.food;
    if (!food) throw badRequest('Provide either a foodId or the food details');
    snapshot = {
      foodId: null,
      foodName: food.name,
      brand: food.brand,
      energyKj: food.per100g.energyKj,
      proteinG: food.per100g.proteinG,
      carbsG: food.per100g.carbsG,
      fatG: food.per100g.fatG,
    };
  }

  const [created] = await deps.db
    .insert(foodEntries)
    .values({
      id: input.id,
      userId,
      entryDate: input.date,
      mealSlot: input.mealSlot,
      quantityG: input.quantityG,
      ...snapshot,
    })
    .returning();

  if (!created) throw conflict('That entry already exists');

  await awardNutritionXp(deps, userId, input.date);
  return toEntry(created);
}

/**
 * FR-NUT-13. XP for logging on a day, once.
 *
 * Keyed on the date, so the partial unique index on
 * `(user_id, source, reference_id)` makes "once per day" an invariant rather
 * than something this function has to check. `onConflictDoNothing` turns the
 * second entry of the day into a no-op instead of an error.
 *
 * Failure here is swallowed. The Hunter System is decoration over real data
 * (FR-HS-12): a user's food entry must not fail because an XP row did not
 * insert.
 */
async function awardNutritionXp(
  deps: NutritionDeps,
  userId: string,
  date: string,
): Promise<void> {
  try {
    await deps.db
      .insert(xpEvents)
      .values({
        id: newId(),
        userId,
        source: 'nutrition',
        amount: XP_PER_NUTRITION_DAY,
        referenceId: date,
        breakdown: { reason: 'Logged your food', date },
      })
      .onConflictDoNothing();
  } catch {
    // Deliberately silent. See FR-HS-12.
  }
}

/** FR-NUT-12. */
export async function updateEntry(
  deps: NutritionDeps,
  userId: string,
  entryId: string,
  patch: UpdateFoodEntryRequest,
): Promise<FoodEntry> {
  if (patch.quantityG === undefined && patch.mealSlot === undefined) {
    throw badRequest('Nothing to change');
  }

  const [updated] = await deps.db
    .update(foodEntries)
    .set({
      ...(patch.quantityG === undefined ? {} : { quantityG: patch.quantityG }),
      ...(patch.mealSlot === undefined ? {} : { mealSlot: patch.mealSlot }),
    })
    .where(and(eq(foodEntries.id, entryId), eq(foodEntries.userId, userId)))
    .returning();

  if (!updated) throw notFound('That entry could not be found');
  return toEntry(updated);
}

/**
 * FR-NUT-12: deleted, not archived.
 *
 * The archive rule (§9.3) protects catalogue rows that history *references*. A
 * food entry is the history, references nothing, and a mistyped one the user
 * deletes should be gone.
 */
export async function deleteEntry(
  deps: NutritionDeps,
  userId: string,
  entryId: string,
): Promise<void> {
  const deleted = await deps.db
    .delete(foodEntries)
    .where(and(eq(foodEntries.id, entryId), eq(foodEntries.userId, userId)))
    .returning({ id: foodEntries.id });

  if (deleted.length === 0) throw notFound('That entry could not be found');
}

// --------------------------------------------------------------------- day --

/** FR-NUT-10. The estimate from the profile, with any overrides applied. */
export async function targetsFor(
  deps: NutritionDeps,
  userId: string,
): Promise<NutritionTargets> {
  const [profile] = await deps.db
    .select({
      bodyweightKg: userProfiles.bodyweightKg,
      experience: userProfiles.experience,
      trainingDaysPerWeek: userProfiles.trainingDaysPerWeek,
      targetEnergyKj: userProfiles.targetEnergyKj,
      targetProteinG: userProfiles.targetProteinG,
      targetCarbsG: userProfiles.targetCarbsG,
      targetFatG: userProfiles.targetFatG,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile) throw notFound('That profile could not be found');

  const estimated = estimateTargets({
    bodyweightKg: decOrNull(profile.bodyweightKg),
    experience: profile.experience,
    trainingDaysPerWeek: profile.trainingDaysPerWeek,
  });

  const targets = applyTargetOverrides(estimated, {
    energyKj: profile.targetEnergyKj,
    proteinG: decOrNull(profile.targetProteinG),
    carbsG: decOrNull(profile.targetCarbsG),
    fatG: decOrNull(profile.targetFatG),
  });

  return {
    energyKj: targets.energyKj,
    proteinG: decToString(targets.proteinG),
    carbsG: decToString(targets.carbsG),
    fatG: decToString(targets.fatG),
    origin: targets.origin,
    basis: targets.basis,
  };
}

export async function updateTargets(
  deps: NutritionDeps,
  userId: string,
  input: UpdateNutritionTargetsRequest,
): Promise<NutritionTargets> {
  await deps.db
    .update(userProfiles)
    .set({
      targetEnergyKj: input.energyKj,
      targetProteinG: input.proteinG,
      targetCarbsG: input.carbsG,
      targetFatG: input.fatG,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId));

  return targetsFor(deps, userId);
}

/** FR-NUT-09. The day, its totals, and the same totals split by meal. */
export async function nutritionDay(
  deps: NutritionDeps,
  userId: string,
  date: string,
): Promise<NutritionDay> {
  const rows = await deps.db
    .select()
    .from(foodEntries)
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.entryDate, date)))
    .orderBy(foodEntries.loggedAt);

  const entries = rows.map(toEntry);

  const contributions = rows.map((row) => contributionOf(panelOf(row), dec(row.quantityG)));
  const totals = sumContributions(contributions);

  // Every slot is reported, including empty ones: a day with no dinner should
  // show an empty dinner rather than silently omit the row.
  const byMeal = MEAL_SLOTS.map((slot) => {
    const slotContributions: Contribution[] = [];
    let entryCount = 0;
    for (const [index, row] of rows.entries()) {
      if (row.mealSlot !== slot) continue;
      const contribution = contributions[index];
      if (contribution) slotContributions.push(contribution);
      entryCount += 1;
    }
    return {
      mealSlot: slot as MealSlot,
      ...contributionToWire(sumContributions(slotContributions)),
      entryCount,
    };
  });

  return {
    date,
    entries,
    totals: contributionToWire(totals),
    byMeal,
    targets: await targetsFor(deps, userId),
  };
}

/** FR-NUT-14: included in the data export. */
export async function exportNutrition(
  deps: NutritionDeps,
  userId: string,
): Promise<{ entries: FoodEntry[]; customFoods: Food[] }> {
  const [entryRows, foodRows] = await Promise.all([
    deps.db
      .select()
      .from(foodEntries)
      .where(eq(foodEntries.userId, userId))
      .orderBy(foodEntries.entryDate),
    deps.db.select().from(foods).where(eq(foods.userId, userId)),
  ]);

  return { entries: entryRows.map(toEntry), customFoods: foodRows.map(toFood) };
}
