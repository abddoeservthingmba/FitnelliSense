/**
 * Estimated one-rep max. BRD FR-HP-05: Epley, and the formula name is shown
 * in the UI so the number is never presented as ground truth.
 */
import { type Dec, mulFloat } from './decimal';

export const ONE_RM_FORMULA_NAME = 'Epley';
export const ONE_RM_FORMULA_TEXT = '1RM = weight × (1 + reps / 30)';

/** Above this, the estimate is too unreliable to display. */
export const ONE_RM_MAX_REPS = 15;

/**
 * Returns null when the set cannot support an estimate: no weight, no reps,
 * or a rep count high enough that Epley stops being meaningful. Callers show
 * nothing rather than a misleading figure.
 */
export function estimate1RM(weightKg: Dec | null, reps: number | null): Dec | null {
  if (weightKg === null || reps === null) return null;
  if (weightKg <= 0 || reps <= 0) return null;
  if (!Number.isInteger(reps) || reps > ONE_RM_MAX_REPS) return null;
  if (reps === 1) return weightKg;
  return mulFloat(weightKg, 1 + reps / 30);
}
