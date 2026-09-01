/**
 * Nutrition arithmetic — FR-NUT-09, FR-NUT-10 (BRD v0.2 scope extension).
 *
 * Pure, and the only place these sums happen. The rule from §9.3 that forbids
 * float weights applies here for the same reason: a gram is added dozens of
 * times a day, and 0.1 added ten times must be exactly 1.
 *
 * Energy is the exception — whole kilojoules, so ordinary integer arithmetic is
 * exact. Everything else goes through `Dec`.
 */
import { ZERO, add, dec, decToNumber, decToString, mulFloat, type Dec } from './decimal';

/** Grams per 100 g of the food as sold. */
export interface Panel {
  readonly energyKj: number;
  readonly proteinG: Dec;
  readonly carbsG: Dec;
  readonly fatG: Dec;
}

/** What a quantity of a food contributes. */
export interface Contribution {
  readonly energyKj: number;
  readonly proteinG: Dec;
  readonly carbsG: Dec;
  readonly fatG: Dec;
}

export const EMPTY_CONTRIBUTION: Contribution = {
  energyKj: 0,
  proteinG: ZERO,
  carbsG: ZERO,
  fatG: ZERO,
};

/** kJ per kcal, exactly as the labelling regulations define it. */
const KJ_PER_KCAL = 4.184;

/** Presentation only. Nothing is stored or compared in kcal. */
export function kjToKcal(energyKj: number): number {
  return Math.round(energyKj / KJ_PER_KCAL);
}

export function kcalToKj(energyKcal: number): number {
  return Math.round(energyKcal * KJ_PER_KCAL);
}

/**
 * What `quantityG` of a food contributes.
 *
 * The panel is per 100 g, so the factor is `quantityG / 100`. `mulFloat`
 * rounds to two places, which is the right place to lose precision: once, at
 * the point the number becomes a real quantity, rather than repeatedly while
 * summing a day.
 */
export function contributionOf(panel: Panel, quantityG: Dec): Contribution {
  const factor = decToNumber(quantityG) / 100;
  return {
    // Energy is whole kJ. Rounding here rather than carrying a fraction keeps
    // the day's total equal to the sum of the entries shown.
    energyKj: Math.round(panel.energyKj * factor),
    proteinG: mulFloat(panel.proteinG, factor),
    carbsG: mulFloat(panel.carbsG, factor),
    fatG: mulFloat(panel.fatG, factor),
  };
}

/** Adds contributions. The day's total is the sum of what is on screen. */
export function sumContributions(items: readonly Contribution[]): Contribution {
  let total = EMPTY_CONTRIBUTION;
  for (const item of items) {
    total = {
      energyKj: total.energyKj + item.energyKj,
      proteinG: add(total.proteinG, item.proteinG),
      carbsG: add(total.carbsG, item.carbsG),
      fatG: add(total.fatG, item.fatG),
    };
  }
  return total;
}

/** The wire form: decimal strings, matching the shared schemas. */
export function contributionToWire(item: Contribution): {
  energyKj: number;
  proteinG: string;
  carbsG: string;
  fatG: string;
} {
  return {
    energyKj: item.energyKj,
    proteinG: decToString(item.proteinG),
    carbsG: decToString(item.carbsG),
    fatG: decToString(item.fatG),
  };
}

/**
 * Energy the macros account for, in kJ.
 *
 * Useful as a sanity check on a crowd-sourced panel (R15): if this is wildly
 * apart from the stated energy, the panel is probably wrong. It is not used to
 * *correct* anything — a food's stated energy is what the label says.
 */
export function energyFromMacrosKj(panel: Panel): number {
  // 17 kJ/g protein and carbohydrate, 37 kJ/g fat — the Atwater factors as the
  // EU labelling regulation states them.
  const protein = decToNumber(panel.proteinG) * 17;
  const carbs = decToNumber(panel.carbsG) * 17;
  const fat = decToNumber(panel.fatG) * 37;
  return Math.round(protein + carbs + fat);
}

/**
 * Whether a panel's stated energy is plausible given its macros.
 *
 * A 25% tolerance, which is wide on purpose: fibre, polyols and rounding on the
 * label all legitimately move this, so the check is meant to catch a panel that
 * is *wrong*, not one that is imprecise.
 */
export function panelIsPlausible(panel: Panel): boolean {
  const fromMacros = energyFromMacrosKj(panel);
  // A food with no macros and no energy (water, black coffee) is fine.
  if (fromMacros === 0 && panel.energyKj === 0) return true;
  if (panel.energyKj === 0) return fromMacros <= 40;
  const ratio = fromMacros / panel.energyKj;
  return ratio >= 0.75 && ratio <= 1.25;
}

// ----------------------------------------------------------------- targets --

export interface TargetInputs {
  /** Kilograms. Null when the user has not told us (every field is skippable). */
  readonly bodyweightKg: Dec | null;
  readonly experience: 'beginner' | 'intermediate' | 'advanced' | null;
  readonly trainingDaysPerWeek: number | null;
}

export interface Targets {
  readonly energyKj: number;
  readonly proteinG: Dec;
  readonly carbsG: Dec;
  readonly fatG: Dec;
  readonly origin: 'estimated' | 'custom' | 'none';
  readonly basis: string;
}

/**
 * Protein, in grams per kilogram of bodyweight.
 *
 * The range the strength-training literature broadly converges on, differing by
 * how much training there is to recover from. Not a prescription — FR-NUT-11 —
 * and every value is overrideable.
 */
const PROTEIN_G_PER_KG = { beginner: 1.6, intermediate: 1.8, advanced: 2.0 } as const;

/**
 * Energy, in kJ per kilogram of bodyweight per day.
 *
 * A maintenance estimate for someone who trains, before any goal is applied —
 * and no goal ever is. There is deliberately no deficit or surplus here: this
 * product does not recommend losing weight (FR-NUT-11).
 */
const MAINTENANCE_KJ_PER_KG = 130;
/** Each training day above two adds a little. Bounded, because activity is not linear. */
const KJ_PER_TRAINING_DAY = 550;

/**
 * Derives daily targets from what the profile already holds (FR-NUT-10).
 *
 * Returns `origin: 'none'` when bodyweight is unknown, because every figure
 * here scales from it. Guessing a bodyweight to produce a confident-looking
 * calorie target would be the worst possible failure mode for this screen — so
 * the day shows totals with no target at all instead, which is a complete and
 * honest thing to show.
 */
export function estimateTargets(inputs: TargetInputs): Targets {
  if (inputs.bodyweightKg === null) {
    return {
      energyKj: 0,
      proteinG: ZERO,
      carbsG: ZERO,
      fatG: ZERO,
      origin: 'none',
      basis:
        'Add your bodyweight in your profile and we can estimate daily targets. Until then this is a log, not a comparison.',
    };
  }

  const kg = decToNumber(inputs.bodyweightKg);
  const experience = inputs.experience ?? 'beginner';
  const trainingDays = inputs.trainingDaysPerWeek ?? 3;

  const extraDays = Math.max(0, Math.min(4, trainingDays - 2));
  const energyKj = Math.round(kg * MAINTENANCE_KJ_PER_KG + extraDays * KJ_PER_TRAINING_DAY);

  const proteinG = dec(kg * PROTEIN_G_PER_KG[experience]);
  // Fat at 25% of energy, at 37 kJ/g.
  const fatG = dec((energyKj * 0.25) / 37);
  // Carbohydrate takes the remainder, at 17 kJ/g — the balancing term, so the
  // three macros account for the energy figure rather than drifting from it.
  const remainderKj = Math.max(
    0,
    energyKj - decToNumber(proteinG) * 17 - decToNumber(fatG) * 37,
  );
  const carbsG = dec(remainderKj / 17);

  return {
    energyKj,
    proteinG,
    carbsG,
    fatG,
    origin: 'estimated',
    basis: `Estimated from ${kg.toFixed(1)} kg, ${experience} experience and ${trainingDays} training days a week. A starting point to adjust, not a prescription.`,
  };
}

/**
 * Applies the user's overrides over the estimate.
 *
 * Per field, so someone can pin protein and leave the rest derived. Any
 * override at all makes the whole set `custom`, because the user has taken
 * ownership of the numbers and the UI should stop calling them an estimate.
 */
export function applyTargetOverrides(
  estimated: Targets,
  overrides: {
    energyKj: number | null;
    proteinG: Dec | null;
    carbsG: Dec | null;
    fatG: Dec | null;
  },
): Targets {
  const hasOverride =
    overrides.energyKj !== null ||
    overrides.proteinG !== null ||
    overrides.carbsG !== null ||
    overrides.fatG !== null;

  if (!hasOverride) return estimated;

  return {
    energyKj: overrides.energyKj ?? estimated.energyKj,
    proteinG: overrides.proteinG ?? estimated.proteinG,
    carbsG: overrides.carbsG ?? estimated.carbsG,
    fatG: overrides.fatG ?? estimated.fatG,
    origin: 'custom',
    basis: 'Your own targets.',
  };
}

// --------------------------------------------------------------------- XP --

/**
 * XP for a day on which the user logged any food at all (FR-NUT-13).
 *
 * A flat amount for *logging*, awarded once per day, and deliberately not
 * scaled by how close the day came to a target. Paying more for hitting a
 * calorie number would make the gamification layer reward under-eating, which
 * is the failure FR-NUT-11 exists to prevent.
 *
 * Modest next to a workout's ~50+: logging lunch is not training.
 */
export const XP_PER_NUTRITION_DAY = 15;

/**
 * Progress toward a target, bounded to 0..1 for a bar.
 *
 * Returns null when there is no target, so the caller renders a total rather
 * than a bar at an arbitrary fill. Deliberately not clamped in the *value* —
 * over a target is a fact, and hiding it would be worse than showing it — only
 * the bar's fill is bounded.
 */
export function targetFraction(actual: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.max(0, Math.min(1, actual / target));
}
