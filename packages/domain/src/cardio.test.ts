import { describe, expect, it } from 'vitest';
import {
  EMPTY_CARDIO,
  MIN_PACE_RECORD_DISTANCE_M,
  beatsCardioRecord,
  cardioRecordOf,
  cardioTotals,
  cardioXp,
  formatDistance,
  formatDuration,
  formatPace,
  isCardioLogged,
  paceSecsPerKm,
  speedKmh,
} from './cardio';

/** 5 km in 25 minutes — a 5:00/km pace, chosen so the maths is checkable. */
const run = { durationSecs: 1500, distanceM: 5000 };

describe('isCardioLogged', () => {
  it('accepts either figure alone, because people log either alone', () => {
    expect(isCardioLogged({ durationSecs: 1200, distanceM: null })).toBe(true);
    expect(isCardioLogged({ durationSecs: null, distanceM: 5000 })).toBe(true);
  });

  it('rejects an empty set, so an unfilled row is not a zero-distance run', () => {
    expect(isCardioLogged({ durationSecs: null, distanceM: null })).toBe(false);
    expect(isCardioLogged({ durationSecs: 0, distanceM: 0 })).toBe(false);
  });
});

describe('cardioTotals', () => {
  it('is empty for no sets', () => {
    expect(cardioTotals([])).toEqual(EMPTY_CARDIO);
  });

  it('adds up time and distance independently', () => {
    const totals = cardioTotals([
      { durationSecs: 600, distanceM: 2000 },
      { durationSecs: 900, distanceM: 3000 },
    ]);
    expect(totals).toEqual({ durationSecs: 1500, distanceM: 5000, sets: 2 });
  });

  it('counts a set that has only one of the two', () => {
    const totals = cardioTotals([
      { durationSecs: 1200, distanceM: null },
      { durationSecs: null, distanceM: 4000 },
    ]);
    expect(totals).toEqual({ durationSecs: 1200, distanceM: 4000, sets: 2 });
  });

  it('skips rows the user never filled in', () => {
    const totals = cardioTotals([
      { durationSecs: 600, distanceM: 2000 },
      { durationSecs: null, distanceM: null },
      { durationSecs: 0, distanceM: 0 },
    ]);
    expect(totals.sets).toBe(1);
    expect(totals.durationSecs).toBe(600);
  });
});

describe('pace and speed', () => {
  it('computes pace in seconds per kilometre', () => {
    // 1500s over 5000m = 300 s/km = 5:00/km
    expect(paceSecsPerKm(run)).toBe(300);
  });

  it('computes speed in km/h', () => {
    // 5 km in 25 minutes = 12 km/h
    expect(speedKmh(run)).toBe(12);
  });

  it('refuses to invent either from one figure alone', () => {
    for (const set of [
      { durationSecs: 1500, distanceM: null },
      { durationSecs: null, distanceM: 5000 },
      { durationSecs: 0, distanceM: 5000 },
      { durationSecs: 1500, distanceM: 0 },
    ]) {
      expect(paceSecsPerKm(set)).toBeNull();
      expect(speedKmh(set)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('writes pace as mm:ss', () => {
    expect(formatPace(300)).toBe('5:00');
    expect(formatPace(365)).toBe('6:05');
    expect(formatPace(null)).toBe('—');
    expect(formatPace(0)).toBe('—');
  });

  it('writes a duration the way a person would say it', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(2820)).toBe('47m');
    expect(formatDuration(3600)).toBe('1h 00m');
    expect(formatDuration(4500)).toBe('1h 15m');
    expect(formatDuration(0)).toBe('—');
  });

  it('drops seconds above a minute, because nobody reads 47m 12s', () => {
    expect(formatDuration(2832)).toBe('47m');
  });

  it('switches from metres to kilometres at a kilometre', () => {
    expect(formatDistance(400)).toBe('400 m');
    expect(formatDistance(999)).toBe('999 m');
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(5250)).toBe('5.25 km');
    expect(formatDistance(0)).toBe('—');
  });
});

describe('cardioXp', () => {
  it('pays nothing for nothing', () => {
    expect(cardioXp(EMPTY_CARDIO)).toBe(0);
  });

  it('pays for both minutes and distance', () => {
    // 25 minutes * 2 + 5 km * 10 = 50 + 50
    expect(cardioXp(cardioTotals([run]))).toBe(100);
  });

  it('pays for time even with no distance recorded', () => {
    // A stationary bike often gives neither distance nor honest distance.
    const totals = cardioTotals([{ durationSecs: 1800, distanceM: null }]);
    expect(cardioXp(totals)).toBe(60);
  });

  it('is in the same league as a lifting session, not an order above it', () => {
    // A workout's session bonus is 50. A half-hour run should be comparable,
    // or cardio becomes the only rational way to earn levels.
    const halfHour = cardioXp(cardioTotals([{ durationSecs: 1800, distanceM: 5000 }]));
    expect(halfHour).toBeGreaterThan(50);
    expect(halfHour).toBeLessThan(200);
  });
});

describe('cardio records', () => {
  const candidate = cardioRecordOf(run);

  it('derives all three figures from one set', () => {
    expect(candidate).toEqual({ distanceM: 5000, durationSecs: 1500, paceSecsPerKm: 300 });
  });

  it('beats an absent record with anything real', () => {
    expect(beatsCardioRecord('farthest_distance', candidate, null)).toBe(true);
    expect(beatsCardioRecord('longest_duration', candidate, null)).toBe(true);
    expect(beatsCardioRecord('best_pace', candidate, null)).toBe(true);
  });

  it('takes the farthest distance and the longest duration', () => {
    expect(beatsCardioRecord('farthest_distance', candidate, 4000)).toBe(true);
    expect(beatsCardioRecord('farthest_distance', candidate, 6000)).toBe(false);
    expect(beatsCardioRecord('longest_duration', candidate, 1200)).toBe(true);
    expect(beatsCardioRecord('longest_duration', candidate, 1800)).toBe(false);
  });

  it('treats a LOWER pace as better, unlike every other record here', () => {
    expect(beatsCardioRecord('best_pace', candidate, 320)).toBe(true);
    expect(beatsCardioRecord('best_pace', candidate, 280)).toBe(false);
  });

  it('refuses a pace record over a sprint', () => {
    // A 200 m dash produces a pace nobody can hold for a kilometre. Letting it
    // take the record makes the figure useless and unbeatable forever.
    const sprint = cardioRecordOf({ durationSecs: 30, distanceM: 200 });
    expect(sprint.paceSecsPerKm).toBe(150);
    expect(beatsCardioRecord('best_pace', sprint, null)).toBe(false);

    // At the threshold it counts.
    const atThreshold = cardioRecordOf({
      durationSecs: 300,
      distanceM: MIN_PACE_RECORD_DISTANCE_M,
    });
    expect(beatsCardioRecord('best_pace', atThreshold, null)).toBe(true);
  });

  it('takes a distance record but no pace from an untimed long run', () => {
    // "I did 10 km" with no stopwatch. Far enough to clear the distance gate,
    // so this reaches the pace check with nothing to compare.
    const untimed = cardioRecordOf({ durationSecs: null, distanceM: 10_000 });
    expect(beatsCardioRecord('farthest_distance', untimed, null)).toBe(true);
    expect(beatsCardioRecord('best_pace', untimed, null)).toBe(false);
  });

  it('rejects a degenerate pace outright', () => {
    // Not reachable through `cardioRecordOf`, but the function takes any
    // candidate, and a zero pace must never become an unbeatable record.
    expect(
      beatsCardioRecord(
        'best_pace',
        { distanceM: 5000, durationSecs: 1500, paceSecsPerKm: 0 },
        null,
      ),
    ).toBe(false);
  });

  it('takes no record from an empty or one-sided set', () => {
    const timeOnly = cardioRecordOf({ durationSecs: 1200, distanceM: null });
    expect(beatsCardioRecord('farthest_distance', timeOnly, null)).toBe(false);
    expect(beatsCardioRecord('longest_duration', timeOnly, null)).toBe(true);
    expect(beatsCardioRecord('best_pace', timeOnly, null)).toBe(false);

    const empty = cardioRecordOf({ durationSecs: null, distanceM: null });
    expect(beatsCardioRecord('farthest_distance', empty, null)).toBe(false);
    expect(beatsCardioRecord('longest_duration', empty, null)).toBe(false);
    expect(beatsCardioRecord('best_pace', empty, null)).toBe(false);
  });
});
