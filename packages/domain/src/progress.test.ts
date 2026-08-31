import { describe, expect, it } from 'vitest';
import { dec, decToNumber, decToString } from './decimal.js';
import {
  currentStreakDays,
  isoDateDaysAgo,
  progressSeries,
  volumeSince,
  type SessionSets,
} from './progress.js';
import { type LoggedSet } from './types.js';

function set(weight: string | null, reps: number | null, over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    setType: 'normal',
    weightKg: weight === null ? null : dec(weight),
    reps,
    isCompleted: true,
    ...over,
  };
}

const sessions: SessionSets[] = [
  { date: '2026-08-10', sets: [set('80', 8), set('85', 5)] },
  { date: '2026-08-03', sets: [set('80', 5), set('60', 12, { setType: 'warmup' })] },
  { date: '2026-08-17', sets: [set('60', 10, { setType: 'warmup' })] },
];

describe('progressSeries', () => {
  it('returns one oldest-first point per qualifying session', () => {
    const series = progressSeries(sessions, 'best_set_weight');
    expect(series.map((point) => point.date)).toEqual(['2026-08-03', '2026-08-10']);
    expect(decToString(series[1]?.value ?? dec('0'))).toBe('85.00');
  });

  it('computes each metric', () => {
    const at = (metric: Parameters<typeof progressSeries>[1]) =>
      decToString(progressSeries(sessions, metric)[1]?.value ?? dec('0'));
    // 80×8 estimates 101.33, above the heavier 85×5 at 99.17.
    expect(at('estimated_1rm')).toBe('101.33');
    expect(at('total_volume')).toBe('1065.00');
    expect(decToNumber(progressSeries(sessions, 'total_reps')[1]?.value ?? dec('0'))).toBe(13);
  });

  it('skips sessions where the metric cannot be computed', () => {
    const bodyweightOnly: SessionSets[] = [{ date: '2026-08-10', sets: [set('0', 12)] }];
    expect(progressSeries(bodyweightOnly, 'best_set_weight')).toHaveLength(0);
    expect(progressSeries(bodyweightOnly, 'total_reps')).toHaveLength(1);
    expect(progressSeries([{ date: '2026-08-10', sets: [set('40', 20)] }], 'estimated_1rm')).toEqual(
      [],
    );
  });
});

describe('currentStreakDays', () => {
  it('counts consecutive days up to today', () => {
    expect(currentStreakDays(['2026-08-31', '2026-08-30', '2026-08-29'], '2026-08-31')).toBe(3);
  });

  it('still counts a streak that ends yesterday', () => {
    expect(currentStreakDays(['2026-08-30', '2026-08-29'], '2026-08-31')).toBe(2);
  });

  it('is zero when the last workout is older than yesterday', () => {
    expect(currentStreakDays(['2026-08-20'], '2026-08-31')).toBe(0);
  });

  it('is zero with no history', () => {
    expect(currentStreakDays([], '2026-08-31')).toBe(0);
  });

  it('ignores duplicate dates within a day', () => {
    expect(currentStreakDays(['2026-08-31', '2026-08-31', '2026-08-30'], '2026-08-31')).toBe(2);
  });

  it('stops at the first gap', () => {
    expect(
      currentStreakDays(['2026-08-31', '2026-08-30', '2026-08-27', '2026-08-26'], '2026-08-31'),
    ).toBe(2);
  });
});

describe('volumeSince', () => {
  const history = [
    { date: '2026-08-31', volumeKg: dec('1000') },
    { date: '2026-08-25', volumeKg: dec('500') },
    { date: '2026-08-01', volumeKg: dec('900') },
  ];

  it('sums sessions inside the window inclusively', () => {
    expect(decToString(volumeSince(history, isoDateDaysAgo('2026-08-31', 6)))).toBe('1500.00');
    // 29 days back is 2026-08-02, so the 1 August session falls outside.
    expect(decToString(volumeSince(history, isoDateDaysAgo('2026-08-31', 29)))).toBe('1500.00');
    expect(decToString(volumeSince(history, isoDateDaysAgo('2026-08-31', 30)))).toBe('2400.00');
    expect(decToString(volumeSince(history, '2026-09-01'))).toBe('0.00');
  });
});

describe('isoDateDaysAgo', () => {
  it('walks back across a month boundary', () => {
    expect(isoDateDaysAgo('2026-09-02', 6)).toBe('2026-08-27');
    expect(isoDateDaysAgo('2026-09-02', 0)).toBe('2026-09-02');
  });
});
