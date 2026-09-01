import { describe, expect, it } from 'vitest';
import { dec } from './decimal.js';
import {
  MAX_LEVEL,
  STAT_LABELS,
  STAT_SOURCES,
  deriveStats,
  levelFromXp,
  nextRankAt,
  rankForLevel,
  workoutXp,
  xpForLevel,
  xpToNextLevel,
} from './hunter.js';

describe('xpToNextLevel', () => {
  it('grows quadratically, so later levels demand accumulated work', () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(2)).toBe(155);
    expect(xpToNextLevel(10)).toBe(955);
    expect(xpToNextLevel(30)).toBe(5755);
  });

  it('rejects a level below one', () => {
    expect(() => xpToNextLevel(0)).toThrow(RangeError);
  });
});

describe('xpForLevel', () => {
  it('accumulates the steps', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(255);
  });

  it('rejects a level below one', () => {
    expect(() => xpForLevel(0)).toThrow(RangeError);
  });
});

describe('levelFromXp', () => {
  it('is the inverse of xpForLevel at the boundaries', () => {
    for (const level of [1, 2, 5, 12, 40]) {
      expect(levelFromXp(xpForLevel(level)).level).toBe(level);
      // One XP short is still the previous level.
      if (level > 1) expect(levelFromXp(xpForLevel(level) - 1).level).toBe(level - 1);
    }
  });

  it('reports progress within the level', () => {
    const progress = levelFromXp(150);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(50);
    expect(progress.xpForThisLevel).toBe(155);
    expect(progress.fraction).toBeCloseTo(50 / 155, 5);
    expect(progress.totalXp).toBe(150);
  });

  it('starts at level one with no XP', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, fraction: 0 });
  });

  it('caps rather than climbing forever, and reads as full at the cap', () => {
    const capped = levelFromXp(Number.MAX_SAFE_INTEGER / 2);
    expect(capped.level).toBe(MAX_LEVEL);
    expect(capped.fraction).toBe(1);
  });

  it('rejects nonsense', () => {
    expect(() => levelFromXp(-1)).toThrow(RangeError);
    expect(() => levelFromXp(Number.NaN)).toThrow(RangeError);
  });
});

describe('ranks', () => {
  it('maps levels to the rank ladder', () => {
    expect(rankForLevel(1)).toBe('E');
    expect(rankForLevel(9)).toBe('E');
    expect(rankForLevel(10)).toBe('D');
    expect(rankForLevel(20)).toBe('C');
    expect(rankForLevel(35)).toBe('B');
    expect(rankForLevel(55)).toBe('A');
    expect(rankForLevel(80)).toBe('S');
    expect(rankForLevel(500)).toBe('S');
  });

  it('falls back to E below the ladder', () => {
    expect(rankForLevel(0)).toBe('E');
  });

  it('reports the next rank, and nothing at the top', () => {
    expect(nextRankAt(1)).toEqual({ rank: 'D', atLevel: 10 });
    expect(nextRankAt(35)).toEqual({ rank: 'A', atLevel: 55 });
    expect(nextRankAt(80)).toBeNull();
  });
});

describe('workoutXp', () => {
  it('itemises every term', () => {
    const xp = workoutXp({
      volumeKg: dec('5000'),
      completedSets: 12,
      personalRecords: 1,
      streakDays: 0,
    });
    expect(xp.session).toBe(50);
    expect(xp.volume).toBe(50); // 5000 kg / 100
    expect(xp.sets).toBe(24);
    expect(xp.records).toBe(100);
    expect(xp.streakBonus).toBe(0);
    expect(xp.total).toBe(224);
  });

  it('applies the streak multiplier and caps it', () => {
    const short = workoutXp({
      volumeKg: dec('1000'),
      completedSets: 10,
      personalRecords: 0,
      streakDays: 5,
    });
    expect(short.streakMultiplier).toBe(1.1);
    // base 50 + 10 + 20 = 80, ×1.1 → +8
    expect(short.streakBonus).toBe(8);
    expect(short.total).toBe(88);

    const long = workoutXp({
      volumeKg: dec('1000'),
      completedSets: 10,
      personalRecords: 0,
      streakDays: 400,
    });
    expect(long.streakMultiplier).toBe(1.28);
  });

  it('never pays for negative or fractional input', () => {
    const xp = workoutXp({
      volumeKg: dec('-500'),
      completedSets: -3,
      personalRecords: -1,
      streakDays: -9,
    });
    expect(xp.volume).toBe(0);
    expect(xp.sets).toBe(0);
    expect(xp.records).toBe(0);
    expect(xp.total).toBe(50);
  });

  it('awards the session XP even for an empty workout', () => {
    const xp = workoutXp({
      volumeKg: dec('0'),
      completedSets: 0,
      personalRecords: 0,
      streakDays: 1,
    });
    expect(xp.total).toBe(51);
  });
});

describe('deriveStats', () => {
  it('sums only the three strongest lifts', () => {
    const stats = deriveStats({
      bestOneRepMaxes: [dec('100'), dec('140'), dec('60'), dec('20')],
      volume30dKg: dec('30000'),
      currentStreakDays: 4,
      workoutsLast30Days: 12,
    });
    // 140 + 100 + 60 = 300 → 30
    expect(stats.strength).toBe(30);
    expect(stats.endurance).toBe(30);
    expect(stats.discipline).toBe(4 + 18);
  });

  it('is zero across the board for a new account', () => {
    expect(
      deriveStats({
        bestOneRepMaxes: [],
        volume30dKg: dec('0'),
        currentStreakDays: 0,
        workoutsLast30Days: 0,
      }),
    ).toEqual({ strength: 0, endurance: 0, discipline: 0 });
  });

  it('labels and explains every stat, so no number is unexplained', () => {
    for (const key of ['strength', 'endurance', 'discipline'] as const) {
      expect(STAT_LABELS[key]).toBeTruthy();
      expect(STAT_SOURCES[key].length).toBeGreaterThan(20);
    }
  });
});
