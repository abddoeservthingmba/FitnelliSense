/**
 * Daily quests.
 *
 * Two rules shape all of this. First, a quest must be generated
 * deterministically from the date and the user — otherwise the set changes on
 * every refresh and nothing can be relied on. Second, the targets must come
 * from what this person actually does: telling a beginner to move 10 tonnes is
 * not a challenge, it is a dismissal, and telling an advanced lifter to
 * complete one set is not a quest at all.
 *
 * So targets scale off recent history and the onboarding answers, and the
 * selection is a hash of `${userId}:${date}` — stable all day, different
 * tomorrow, different per person.
 */
import { type Dec, decToNumber } from './decimal.js';

export type QuestKey =
  | 'complete_workout'
  | 'log_sets'
  | 'move_volume'
  | 'set_record'
  | 'train_duration'
  | 'hit_exercises';

export interface QuestDefinition {
  key: QuestKey;
  /** Shown as the quest line. `{target}` is substituted. */
  template: string;
  /** The unit the progress bar counts in. */
  unit: 'workout' | 'sets' | 'kg' | 'record' | 'minutes' | 'exercises';
  xp: number;
  /** A quest nobody can fail is not worth XP; these are the reachable ones. */
  weight: number;
}

export const QUEST_DEFINITIONS: Record<QuestKey, QuestDefinition> = {
  complete_workout: {
    key: 'complete_workout',
    template: 'Complete {target} workout',
    unit: 'workout',
    xp: 60,
    weight: 5,
  },
  log_sets: {
    key: 'log_sets',
    template: 'Log {target} working sets',
    unit: 'sets',
    xp: 40,
    weight: 4,
  },
  move_volume: {
    key: 'move_volume',
    template: 'Move {target} kg of total volume',
    unit: 'kg',
    xp: 50,
    weight: 4,
  },
  train_duration: {
    key: 'train_duration',
    template: 'Train for {target} minutes',
    unit: 'minutes',
    xp: 40,
    weight: 3,
  },
  hit_exercises: {
    key: 'hit_exercises',
    template: 'Work {target} different exercises',
    unit: 'exercises',
    xp: 40,
    weight: 3,
  },
  set_record: {
    key: 'set_record',
    template: 'Set a personal record',
    unit: 'record',
    xp: 120,
    // Rare on purpose: a record cannot be willed, so it is a bonus rather than
    // a daily obligation.
    weight: 1,
  },
};

export interface Quest {
  key: QuestKey;
  /** The quest line, with the target substituted in. */
  text: string;
  target: number;
  unit: QuestDefinition['unit'];
  xp: number;
}

export interface QuestContext {
  /** Median completed sets across recent sessions, or null with no history. */
  typicalSets: number | null;
  /** Median session volume in kilograms, or null with no history. */
  typicalVolumeKg: Dec | null;
  /** From onboarding; used before there is any history. */
  sessionMinutes: number | null;
  level: number;
}

/**
 * A small stable hash. Not cryptographic — it only has to spread evenly and
 * give the same answer on every device for the same day.
 */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Rounds to something that reads like a target rather than a measurement. */
function readableTarget(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function targetFor(key: QuestKey, context: QuestContext): number {
  switch (key) {
    case 'complete_workout':
      return 1;
    case 'log_sets':
      // Slightly above a normal session, so it takes intent but not heroics.
      return readableTarget((context.typicalSets ?? 9) * 1.1, 2);
    case 'move_volume': {
      const typical = context.typicalVolumeKg ? decToNumber(context.typicalVolumeKg) : 2500;
      return readableTarget(typical * 1.05, 250);
    }
    case 'train_duration':
      return readableTarget(context.sessionMinutes ?? 45, 15);
    case 'hit_exercises':
      return context.level < 10 ? 3 : 4;
    case 'set_record':
      return 1;
  }
}

/** How many quests a day. Three is enough to feel like a list, few enough to finish. */
export const QUESTS_PER_DAY = 3;

/**
 * Picks an index from a non-empty pool, weighted, from a seed.
 *
 * Written to be total rather than defensive: the walk cannot run past the end,
 * and `Math.min` handles the boundary without a branch. Guarding an impossible
 * case with a throw would leave a line no test can reach, which is worse than
 * the case it guards against.
 */
function weightedIndex(pool: readonly QuestDefinition[], seed: number): number {
  const totalWeight = pool.reduce((sum, definition) => sum + definition.weight, 0);
  let remaining = seed % totalWeight;
  let index = 0;

  for (const definition of pool) {
    if (remaining < definition.weight) break;
    remaining -= definition.weight;
    index += 1;
  }

  return Math.min(index, pool.length - 1);
}

/**
 * The day's quests. `complete_workout` is always present — it is the point of
 * the app — and the rest are drawn by weight from the stable hash.
 */
export function dailyQuests(
  userId: string,
  isoDate: string,
  context: QuestContext,
): Quest[] {
  const build = (key: QuestKey): Quest => {
    const definition = QUEST_DEFINITIONS[key];
    const target = targetFor(key, context);
    return {
      key,
      target,
      unit: definition.unit,
      xp: definition.xp,
      text: definition.template.replace('{target}', formatTarget(target, definition.unit)),
    };
  };

  const chosen: QuestKey[] = ['complete_workout'];

  // Weighted draw without replacement, seeded per user per day.
  const pool: readonly QuestDefinition[] = Object.values(QUEST_DEFINITIONS).filter(
    (definition) => definition.key !== 'complete_workout',
  );
  let seed = hash(`${userId}:${isoDate}`);

  let remaining = pool;
  while (chosen.length < QUESTS_PER_DAY && remaining.length > 0) {
    seed = hash(String(seed));
    const drawn = weightedIndex(remaining, seed);
    // Filtering rather than indexing keeps this free of optional access, so
    // there is no impossible-undefined case to guard.
    chosen.push(...remaining.filter((_, index) => index === drawn).map((d) => d.key));
    remaining = remaining.filter((_, index) => index !== drawn);
  }

  return chosen.map(build);
}

function formatTarget(target: number, unit: QuestDefinition['unit']): string {
  if (unit === 'kg') return target.toLocaleString();
  return String(target);
}

/** Whether a quest's progress has reached its target. */
export function questComplete(progress: number, target: number): boolean {
  return progress >= target;
}

/** 0..1 for the progress bar. */
export function questFraction(progress: number, target: number): number {
  if (target <= 0) return 1;
  return Math.min(1, Math.max(0, progress / target));
}

export interface SessionContribution {
  completedSets: number;
  volumeKg: Dec;
  durationMinutes: number;
  distinctExercises: number;
  personalRecords: number;
}

/**
 * What a finished session adds to a quest. Returned as an increment rather than
 * an absolute, so two sessions in a day accumulate.
 */
export function questProgressFrom(key: QuestKey, session: SessionContribution): number {
  switch (key) {
    case 'complete_workout':
      return 1;
    case 'log_sets':
      return session.completedSets;
    case 'move_volume':
      return Math.floor(decToNumber(session.volumeKg));
    case 'train_duration':
      return Math.floor(session.durationMinutes);
    case 'hit_exercises':
      return session.distinctExercises;
    case 'set_record':
      return session.personalRecords;
  }
}
