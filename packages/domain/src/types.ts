/**
 * The narrow shapes domain calculations operate on. Deliberately structural:
 * `packages/domain` knows nothing about Drizzle rows, HTTP payloads or React
 * state, so both the API and the client can feed it what they already have.
 */
import { type Dec } from './decimal';

export type SetType = 'normal' | 'warmup' | 'failure' | 'drop';

/**
 * Every kind of personal record.
 *
 * The strength three and the cardio three sit in one union because they share a
 * table and a key. They do **not** share detection: `PR_TYPES` in
 * personal-records.ts lists only the strength ones, because `weight × reps`
 * arithmetic cannot produce a distance, and `best_pace` is the sole record here
 * where a lower value wins.
 */
export type StrengthPrType = 'heaviest_weight' | 'best_1rm' | 'best_set_volume';
export type CardioPrType = 'farthest_distance' | 'longest_duration' | 'best_pace';
export type PrType = StrengthPrType | CardioPrType;

export interface LoggedSet {
  readonly setType: SetType;
  /** Cardio (FR-CAR-02). Null on every strength set, which is most of them. */
  readonly durationSecs?: number | null;
  readonly distanceM?: number | null;
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
