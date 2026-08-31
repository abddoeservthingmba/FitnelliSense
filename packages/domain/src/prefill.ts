/**
 * Set prefill chain. BRD FR-WK-06 and J2's "≤3 taps per set" acceptance
 * criterion: previous set in this workout -> same exercise last session ->
 * routine target -> empty. The order is the product decision; keeping it here
 * means the logging screen never re-implements it.
 */
import { type Dec } from './decimal.js';

export interface PrefillSource {
  readonly weightKg: Dec | null;
  readonly reps: number | null;
}

export interface RoutineTarget {
  readonly targetWeightKg: Dec | null;
  readonly targetRepsMin: number | null;
  readonly targetRepsMax: number | null;
}

export interface PrefillInputs {
  /** The last set already logged for this exercise in the live workout. */
  readonly previousSet?: PrefillSource | null;
  /** The top set of the most recent completed session for this exercise. */
  readonly lastSession?: PrefillSource | null;
  readonly routineTarget?: RoutineTarget | null;
}

export type PrefillOrigin = 'previous_set' | 'last_session' | 'routine_target' | 'empty';

export interface Prefill {
  readonly weightKg: Dec | null;
  readonly reps: number | null;
  /** Surfaced in the UI as a subtle hint, so the number is never unexplained. */
  readonly origin: PrefillOrigin;
}

function usable(source: PrefillSource | null | undefined): source is PrefillSource {
  return !!source && (source.weightKg !== null || source.reps !== null);
}

/** The bottom of a target range is the honest default — it is the achievable end. */
function targetReps(target: RoutineTarget): number | null {
  return target.targetRepsMin ?? target.targetRepsMax ?? null;
}

export function prefillSet(inputs: PrefillInputs): Prefill {
  if (usable(inputs.previousSet)) {
    return { ...inputs.previousSet, origin: 'previous_set' };
  }
  if (usable(inputs.lastSession)) {
    return { ...inputs.lastSession, origin: 'last_session' };
  }
  const target = inputs.routineTarget;
  if (target && (target.targetWeightKg !== null || targetReps(target) !== null)) {
    return {
      weightKg: target.targetWeightKg,
      reps: targetReps(target),
      origin: 'routine_target',
    };
  }
  return { weightKg: null, reps: null, origin: 'empty' };
}
