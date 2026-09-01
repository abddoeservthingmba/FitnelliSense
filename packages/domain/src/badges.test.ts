import { describe, expect, it } from 'vitest';
import { dec } from './decimal';
import {
  BADGES_BY_KEY,
  BADGE_DEFINITIONS,
  badgeProgress,
  detectBadges,
  type BadgeContext,
} from './badges';

const empty: BadgeContext = {
  totalWorkouts: 0,
  totalRecords: 0,
  longestStreakDays: 0,
  bestSessionVolumeKg: dec('0'),
  lifetimeVolumeKg: dec('0'),
  level: 1,
  rank: 'E',
};

describe('detectBadges', () => {
  it('awards nothing for an untouched account', () => {
    expect(detectBadges(empty, new Set())).toEqual([]);
  });

  it('awards the first workout, once', () => {
    const context = { ...empty, totalWorkouts: 1 };
    const earned = detectBadges(context, new Set());
    expect(earned.map((badge) => badge.key)).toEqual(['first_blood']);

    // Already held: not offered again.
    expect(detectBadges(context, new Set(['first_blood']))).toEqual([]);
  });

  it('awards every threshold crossed at once', () => {
    const keys = detectBadges(
      {
        ...empty,
        totalWorkouts: 100,
        totalRecords: 10,
        longestStreakDays: 100,
        bestSessionVolumeKg: dec('10000'),
        lifetimeVolumeKg: dec('100000'),
        level: 80,
        rank: 'S',
      },
      new Set(),
    ).map((badge) => badge.key);

    expect(keys).toContain('hundred_sessions');
    expect(keys).toContain('ten_records');
    expect(keys).toContain('month_streak');
    expect(keys).toContain('ten_tonne_club');
    expect(keys).toContain('hundred_tonne_club');
    expect(keys).toContain('rank_s');
    // Every definition should be earned by that context.
    expect(keys).toHaveLength(BADGE_DEFINITIONS.length);
  });

  it('checks each threshold at its exact boundary', () => {
    const earned = (context: Partial<BadgeContext>): string[] =>
      detectBadges({ ...empty, ...context }, new Set()).map((badge) => badge.key);

    expect(earned({ totalWorkouts: 9 })).not.toContain('ten_sessions');
    expect(earned({ totalWorkouts: 10 })).toContain('ten_sessions');
    expect(earned({ totalWorkouts: 50 })).toContain('fifty_sessions');
    expect(earned({ totalRecords: 1 })).toContain('first_record');
    expect(earned({ longestStreakDays: 7 })).toContain('week_streak');
    expect(earned({ longestStreakDays: 100 })).toContain('hundred_streak');
    expect(earned({ bestSessionVolumeKg: dec('1000') })).toContain('tonne_club');
    expect(earned({ bestSessionVolumeKg: dec('999') })).not.toContain('tonne_club');
    expect(earned({ level: 10 })).toContain('rank_d');
    expect(earned({ level: 20 })).toContain('rank_c');
    expect(earned({ level: 35 })).toContain('rank_b');
    expect(earned({ level: 55 })).toContain('rank_a');
  });
});

describe('badgeProgress', () => {
  it('returns every badge with its state, for the collection screen', () => {
    const progress = badgeProgress({ ...empty, totalWorkouts: 1 }, new Set());
    expect(progress).toHaveLength(BADGE_DEFINITIONS.length);
    expect(progress.find((entry) => entry.badge.key === 'first_blood')?.earned).toBe(true);
    expect(progress.find((entry) => entry.badge.key === 'rank_s')?.earned).toBe(false);
  });

  it('treats a stored badge as earned even if the context no longer proves it', () => {
    // A streak resets; the badge does not.
    const progress = badgeProgress(empty, new Set(['week_streak']));
    expect(progress.find((entry) => entry.badge.key === 'week_streak')?.earned).toBe(true);
  });
});

describe('badge definitions', () => {
  it('states a requirement for every badge, so a locked one still explains itself', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.requirement.length).toBeGreaterThan(10);
      expect(badge.name).toBeTruthy();
      expect(badge.xp).toBeGreaterThan(0);
      expect(BADGES_BY_KEY[badge.key]).toBe(badge);
    }
  });

  it('has unique keys', () => {
    const keys = BADGE_DEFINITIONS.map((badge) => badge.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
