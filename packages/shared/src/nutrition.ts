/**
 * Nutrition contracts — FR-NUT-01..14 (BRD v0.2 scope extension).
 *
 * Two rules shape every schema here.
 *
 * **Macros are fixed-point, like weights.** §9.3 forbids floats for loads, and
 * the same argument applies: 0.1 g of fat added a hundred times must equal 10 g.
 * Energy is whole kilojoules; the three macronutrients are decimal strings in
 * grams, handled by `packages/domain` and nowhere else.
 *
 * **Nutrition is stated per 100 g.** That is how food labels and every food
 * database express it, so storing it any other way means converting on the way
 * in and back out again for no gain.
 */
import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  shortTextSchema,
  uuidSchema,
} from './primitives';

/**
 * Which meal an entry belongs to.
 *
 * Four slots, fixed. Free-text meal names would make "Lunch" and "lunch" two
 * different meals and make a daily breakdown impossible to group.
 */
export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Where a food's figures came from (FR-NUT-07). */
export const foodSourceSchema = z.enum([
  /** Fetched from Open Food Facts and cached locally. */
  'open_food_facts',
  /** The user typed it in themselves (FR-NUT-08). */
  'custom',
]);

/**
 * Energy in kilojoules, as a whole number.
 *
 * kJ rather than kcal because it is the SI unit and the one food labels are
 * legally required to carry; kcal is derived for display, the same way pounds
 * are derived from kilograms. Whole numbers because no food label is precise to
 * a fraction of a kilojoule.
 */
export const energyKjSchema = z.number().int().min(0).max(40_000);

/**
 * Energy per 100 g.
 *
 * Bounded at 4000 to match the `foods_macros_per_100g` CHECK constraint. Pure
 * fat is about 3700 kJ/100 g, so nothing edible exceeds this. The bound has to
 * agree with the database's: if Zod were the looser of the two, a bad food would
 * reach Postgres and come back a 500 instead of a 400.
 */
export const energyKjPer100gSchema = z.number().int().min(0).max(4000);

/** Grams per 100 g. Bounded at 100 because more than that is not a food. */
export const macroGramsSchema = positiveDecimalStringSchema.refine(
  (value) => Number(value) <= 100,
  { message: 'Cannot exceed 100 g per 100 g' },
);

/**
 * Grams in a whole day — a target, or an entry's contribution.
 *
 * A separate bound from `macroGramsSchema`, which caps at 100 because it means
 * "per 100 g". A daily protein target of 150 g is ordinary, so reusing that
 * schema here would have rejected it.
 */
export const dailyGramsSchema = positiveDecimalStringSchema.refine(
  (value) => Number(value) <= 2000,
  { message: 'That is not a realistic daily amount' },
);

/** The nutrition panel, always per 100 g of the food as sold. */
export const nutritionPer100gSchema = z.object({
  energyKj: energyKjPer100gSchema,
  proteinG: macroGramsSchema,
  carbsG: macroGramsSchema,
  fatG: macroGramsSchema,
});

// ------------------------------------------------------------------- foods --

export const foodSchema = z.object({
  id: uuidSchema,
  name: shortTextSchema,
  /** The manufacturer, where the source gives one. */
  brand: shortTextSchema.nullable(),
  /** EAN/UPC. Present only for products that carry one (FR-NUT-05). */
  barcode: z.string().trim().regex(/^\d{8,14}$/).nullable(),
  source: foodSourceSchema,
  /** Null for a catalogue food; set for a custom one, which is private to it. */
  userId: uuidSchema.nullable(),
  per100g: nutritionPer100gSchema,
  /**
   * A portion the user is likely to want, in grams — "1 slice (30 g)". Advisory
   * only: the entry always stores grams, so a missing serving costs nothing.
   */
  servingG: positiveDecimalStringSchema.nullable(),
  servingLabel: shortTextSchema.nullable(),
});

export const foodSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const barcodeLookupParamsSchema = z.object({
  barcode: z.string().trim().regex(/^\d{8,14}$/, 'That is not a barcode'),
});

export const createFoodRequestSchema = z.object({
  id: uuidSchema,
  name: shortTextSchema,
  brand: shortTextSchema.nullable().default(null),
  per100g: nutritionPer100gSchema,
  servingG: positiveDecimalStringSchema.nullable().default(null),
  servingLabel: shortTextSchema.nullable().default(null),
});

// ----------------------------------------------------------------- entries --

/**
 * A logged entry.
 *
 * FR-NUT-03: it carries its own copy of the nutrition figures. Open Food Facts
 * is crowd-edited and recipes change, so an entry that only pointed at a
 * catalogue row would let a later edit silently rewrite yesterday's total. The
 * snapshot is what makes history stable — the same reasoning as §9.3's rule that
 * a set stores its own weight.
 */
export const foodEntrySchema = z.object({
  id: uuidSchema,
  date: isoDateSchema,
  mealSlot: mealSlotSchema,
  foodId: uuidSchema.nullable(),
  /** Copied at log time, so the row still reads correctly if the food changes. */
  foodName: shortTextSchema,
  brand: shortTextSchema.nullable(),
  quantityG: positiveDecimalStringSchema,
  /** The snapshot. Not a join — deliberately (FR-NUT-03). */
  per100g: nutritionPer100gSchema,
  /** The entry's own contribution, computed in `packages/domain`. */
  totals: z.object({
    energyKj: z.number().int(),
    proteinG: positiveDecimalStringSchema,
    carbsG: positiveDecimalStringSchema,
    fatG: positiveDecimalStringSchema,
  }),
  loggedAt: isoDateTimeSchema,
});

export const createFoodEntryRequestSchema = z.object({
  id: uuidSchema,
  date: isoDateSchema,
  mealSlot: mealSlotSchema,
  quantityG: positiveDecimalStringSchema,
  /**
   * Either a food to copy the panel from, or the panel itself for a one-off
   * that is not worth saving as a food. Exactly one, so an entry can never be
   * created with no figures at all.
   */
  foodId: uuidSchema.optional(),
  food: z
    .object({
      name: shortTextSchema,
      brand: shortTextSchema.nullable().default(null),
      per100g: nutritionPer100gSchema,
    })
    .optional(),
});

export const updateFoodEntryRequestSchema = z.object({
  quantityG: positiveDecimalStringSchema.optional(),
  mealSlot: mealSlotSchema.optional(),
});

// ---------------------------------------------------------------- the day --

/** What a target is, and where it came from. */
export const nutritionTargetsSchema = z.object({
  energyKj: z.number().int(),
  proteinG: dailyGramsSchema,
  carbsG: dailyGramsSchema,
  fatG: dailyGramsSchema,
  /**
   * FR-NUT-11: a target is derived, not prescribed, and the UI must be able to
   * say which. `estimated` means we worked it out from the profile; `custom`
   * means the user set it; `none` means we had too little profile to estimate
   * and are showing totals only.
   */
  origin: z.enum(['estimated', 'custom', 'none']),
  /** One plain sentence saying how it was derived. Never medical advice. */
  basis: z.string().max(300),
});

export const nutritionDaySchema = z.object({
  date: isoDateSchema,
  entries: z.array(foodEntrySchema),
  totals: z.object({
    energyKj: z.number().int(),
    proteinG: positiveDecimalStringSchema,
    carbsG: positiveDecimalStringSchema,
    fatG: positiveDecimalStringSchema,
  }),
  /** The same totals split by meal, so the day can be read as a day. */
  byMeal: z.array(
    z.object({
      mealSlot: mealSlotSchema,
      energyKj: z.number().int(),
      proteinG: positiveDecimalStringSchema,
      carbsG: positiveDecimalStringSchema,
      fatG: positiveDecimalStringSchema,
      entryCount: z.number().int(),
    }),
  ),
  targets: nutritionTargetsSchema,
});

export const updateNutritionTargetsRequestSchema = z.object({
  /** Null on every field clears the override and returns to the estimate. */
  energyKj: energyKjSchema.nullable(),
  proteinG: dailyGramsSchema.nullable(),
  carbsG: dailyGramsSchema.nullable(),
  fatG: dailyGramsSchema.nullable(),
});

export type MealSlot = z.infer<typeof mealSlotSchema>;
export type FoodSource = z.infer<typeof foodSourceSchema>;
export type NutritionPer100g = z.infer<typeof nutritionPer100gSchema>;
export type Food = z.infer<typeof foodSchema>;
export type CreateFoodRequest = z.infer<typeof createFoodRequestSchema>;
export type FoodEntry = z.infer<typeof foodEntrySchema>;
export type CreateFoodEntryRequest = z.infer<typeof createFoodEntryRequestSchema>;
export type UpdateFoodEntryRequest = z.infer<typeof updateFoodEntryRequestSchema>;
export type NutritionTargets = z.infer<typeof nutritionTargetsSchema>;
export type NutritionDay = z.infer<typeof nutritionDaySchema>;
export type UpdateNutritionTargetsRequest = z.infer<typeof updateNutritionTargetsRequestSchema>;
