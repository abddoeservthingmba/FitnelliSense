/**
 * The narrow shapes domain calculations operate on. Deliberately structural:
 * `packages/domain` knows nothing about Drizzle rows, HTTP payloads or React
 * state, so both the API and the client can feed it what they already have.
 */
import { type Dec } from './decimal.js';

export type SetType = 'normal' | 'warmup' | 'failure' | 'drop';

export type PrType = 'heaviest_weight' | 'best_1rm' | 'best_set_volume';

export interface LoggedSet {
  readonly setType: SetType;
  readonly weightKg: Dec | null;
  readonly reps: number | null;
  readonly isCompleted: boolean;
}

/** A set plus the identity needed to attribute a record to an exercise. */
export interface AttributedSet extends LoggedSet {
  readonly id: string;
  readonly exerciseId: string;
}

/**
 * A set that has passed `countsTowardVolume` and therefore has a weight and a
 * rep count. Narrowing through this type is what keeps the calculation
 * functions free of null checks that can never fire.
 */
export type Counting<T extends LoggedSet> = T & {
  readonly weightKg: Dec;
  readonly reps: number;
};
