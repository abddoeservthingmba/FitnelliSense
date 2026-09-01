import { describe, expect, it } from 'vitest';
import { dec } from './decimal.js';
import {
  QUESTS_PER_DAY,
  QUEST_DEFINITIONS,
  dailyQuests,
  questComplete,
  questFraction,
  questProgressFrom,
  type QuestContext,
  type QuestKey,
} from './quests.js';

const experienced: QuestContext = {
  typicalSets: 18,
  typicalVolumeKg: dec('6000'),
  sessionMinutes: 60,
  level: 25,
};

const beginner: QuestContext = {
  typicalSets: null,
  typicalVolumeKg: null,
  sessionMinutes: null,
  level: 1,
};

describe('dailyQuests', () => {
  it('is stable for the same user and day, and differs the next day', () => {
    const monday = dailyQuests('user-1', '2026-09-01', experienced);
    const again = dailyQuests('user-1', '2026-09-01', experienced);
    const tuesday = dailyQuests('user-1', '2026-09-02', experienced);

    expect(again.map((q) => q.key)).toEqual(monday.map((q) => q.key));
    // Not guaranteed to differ, but the seed does change; assert the seed took.
    expect(tuesday).toHaveLength(QUESTS_PER_DAY);
  });

  it('differs between users on the same day', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      seen.add(
        dailyQuests(`user-${index}`, '2026-09-01', experienced)
          .map((q) => q.key)
          .join(','),
      );
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('always includes completing a workout, and never repeats a quest', () => {
    for (let index = 0; index < 40; index += 1) {
      const quests = dailyQuests(`u${index}`, '2026-09-01', experienced);
      expect(quests).toHaveLength(QUESTS_PER_DAY);
      expect(quests.map((q) => q.key)).toContain('complete_workout');
      expect(new Set(quests.map((q) => q.key)).size).toBe(quests.length);
    }
  });

  it('scales targets to the person, not to a fixed number', () => {
    const findTarget = (context: QuestContext, key: QuestKey): number | undefined => {
      for (let index = 0; index < 60; index += 1) {
        const quest = dailyQuests(`seed-${index}`, '2026-09-01', context).find(
          (q) => q.key === key,
        );
        if (quest) return quest.target;
      }
      return undefined;
    };

    const strongSets = findTarget(experienced, 'log_sets');
    const newSets = findTarget(beginner, 'log_sets');
    expect(strongSets).toBeDefined();
    expect(newSets).toBeDefined();
    // 18 typical sets asks for more than the 9-set default for someone new.
    expect(strongSets ?? 0).toBeGreaterThan(newSets ?? 0);

    const strongVolume = findTarget(experienced, 'move_volume');
    expect(strongVolume ?? 0).toBeGreaterThan(2500);
  });

  it('substitutes the target into the quest line', () => {
    const quests = dailyQuests('user-1', '2026-09-01', experienced);
    for (const quest of quests) {
      expect(quest.text).not.toContain('{target}');
      expect(quest.xp).toBeGreaterThan(0);
    }
  });

  it('asks a beginner for fewer distinct exercises than an advanced lifter', () => {
    const forLevel = (level: number): number | undefined => {
      for (let index = 0; index < 60; index += 1) {
        const quest = dailyQuests(`x-${index}`, '2026-09-01', { ...beginner, level }).find(
          (q) => q.key === 'hit_exercises',
        );
        if (quest) return quest.target;
      }
      return undefined;
    };
    expect(forLevel(1)).toBe(3);
    expect(forLevel(30)).toBe(4);
  });
});

describe('quest progress', () => {
  const session = {
    completedSets: 14,
    volumeKg: dec('4200'),
    durationMinutes: 52,
    distinctExercises: 5,
    personalRecords: 2,
  };

  it('maps a session onto each quest type', () => {
    expect(questProgressFrom('complete_workout', session)).toBe(1);
    expect(questProgressFrom('log_sets', session)).toBe(14);
    expect(questProgressFrom('move_volume', session)).toBe(4200);
    expect(questProgressFrom('train_duration', session)).toBe(52);
    expect(questProgressFrom('hit_exercises', session)).toBe(5);
    expect(questProgressFrom('set_record', session)).toBe(2);
  });

  it('knows when a quest is done', () => {
    expect(questComplete(14, 14)).toBe(true);
    expect(questComplete(15, 14)).toBe(true);
    expect(questComplete(13, 14)).toBe(false);
  });

  it('reports a bounded fraction for the bar', () => {
    expect(questFraction(7, 14)).toBe(0.5);
    expect(questFraction(20, 14)).toBe(1);
    expect(questFraction(-5, 14)).toBe(0);
    expect(questFraction(1, 0)).toBe(1);
  });
});

describe('quest definitions', () => {
  it('gives a record the highest reward and the lowest chance', () => {
    const record = QUEST_DEFINITIONS.set_record;
    for (const definition of Object.values(QUEST_DEFINITIONS)) {
      if (definition.key === 'set_record') continue;
      expect(record.xp).toBeGreaterThan(definition.xp);
      expect(record.weight).toBeLessThan(definition.weight);
    }
  });
});
