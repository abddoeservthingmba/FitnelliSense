import { describe, expect, it } from 'vitest';
import { dec } from './decimal';
import {
  IMBALANCE_MIN_VOLUME_KG,
  MAX_INSIGHTS,
  PLATEAU_MIN_DAYS,
  PLATEAU_MIN_SESSIONS,
  PROGRESSION_MIN_DAYS,
  PROGRESSION_MIN_SESSIONS,
  detectImbalance,
  detectPlateau,
  detectProgression,
  rankInsights,
  summariseAdherence,
  type ExerciseHistory,
  type ExercisePoint,
  type Insight,
} from './insights';

/** A session at a given date and estimated 1RM. Volume tracks it loosely. */
function point(date: string, e1rm: number): ExercisePoint {
  return { date, bestE1RM: dec(e1rm), volumeKg: dec(e1rm * 20) };
}

function history(points: ExercisePoint[]): ExerciseHistory {
  return { exerciseId: 'bench', exerciseName: 'Barbell Bench Press', points };
}

/**
 * The single most important property of this module.
 *
 * An insight engine that always has something to say trains people to ignore
 * it within a week. Every one of these must produce nothing.
 */
describe('silence when the data cannot support a conclusion', () => {
  it('says nothing about an exercise done once', () => {
    expect(detectPlateau(history([point('2026-08-01', 100)]))).toBeNull();
    expect(detectProgression(history([point('2026-08-01', 100)]))).toBeNull();
  });

  it('says nothing about a heavy week mistaken for a trend', () => {
    // Four sessions, but crammed into six days. Enough sessions, not enough time.
    const crammed = history([
      point('2026-08-01', 100),
      point('2026-08-03', 100),
      point('2026-08-05', 100),
      point('2026-08-06', 100),
    ]);
    expect(detectPlateau(crammed)).toBeNull();
  });

  it('says nothing about a plateau with too few sessions, however long the span', () => {
    const sparse = history([
      point('2026-06-01', 100),
      point('2026-07-01', 100),
      point('2026-08-01', 100),
    ]);
    expect(sparse.points.length).toBeLessThan(PLATEAU_MIN_SESSIONS);
    expect(detectPlateau(sparse)).toBeNull();
  });

  it('says nothing about an imbalance with barely any volume logged', () => {
    expect(
      detectImbalance([
        { group: 'chest', volumeKg: dec('500') },
        { group: 'back', volumeKg: dec('100') },
      ]),
    ).toBeNull();
  });

  it('says nothing about a single muscle group', () => {
    expect(detectImbalance([{ group: 'chest', volumeKg: dec('9000') }])).toBeNull();
  });

  it('says nothing about adherence when the user never set a target', () => {
    expect(summariseAdherence({ sessions: 8, days: 28, targetPerWeek: null })).toBeNull();
    expect(summariseAdherence({ sessions: 8, days: 28, targetPerWeek: 0 })).toBeNull();
  });

  it('says nothing about adherence over too short a window', () => {
    expect(summariseAdherence({ sessions: 3, days: 7, targetPerWeek: 3 })).toBeNull();
  });

  it('says nothing about an empty history at all', () => {
    expect(detectPlateau(history([]))).toBeNull();
    expect(detectProgression(history([]))).toBeNull();
    expect(detectImbalance([])).toBeNull();
  });
});

describe('detectPlateau', () => {
  /** Six sessions across six weeks, going nowhere. */
  const stalled = history([
    point('2026-07-01', 100),
    point('2026-07-08', 101),
    point('2026-07-15', 100),
    point('2026-07-22', 101),
    point('2026-07-29', 100),
    point('2026-08-05', 101),
  ]);

  it('detects a genuine stall', () => {
    const insight = detectPlateau(stalled);
    expect(insight?.type).toBe('plateau');
    expect(insight?.title).toContain('Barbell Bench Press');
    expect(insight?.facts.sessions).toBe(6);
  });

  it('carries the figures rather than only the sentence (FR-AI-09)', () => {
    const insight = detectPlateau(stalled);
    // The UI renders these itself, so a model can never introduce a wrong one.
    expect(insight?.facts.baselineE1RM).toBe(101);
    expect(insight?.facts.currentE1RM).toBe(101);
    expect(insight?.facts.changePercent).toBe(0);
    expect(insight?.basis).toContain('6 sessions');
  });

  it('does not call real progress a plateau', () => {
    const improving = history([
      point('2026-07-01', 100),
      point('2026-07-08', 103),
      point('2026-07-15', 106),
      point('2026-07-22', 110),
      point('2026-07-29', 113),
      point('2026-08-05', 116),
    ]);
    expect(detectPlateau(improving)).toBeNull();
  });

  it('tolerates an increase too small to load on a bar', () => {
    // 100 -> 101 is 1%: one small plate, or a good night's sleep.
    const barelyMoved = history([
      point('2026-07-01', 100),
      point('2026-07-08', 100),
      point('2026-07-15', 101),
      point('2026-07-22', 101),
    ]);
    expect(detectPlateau(barelyMoved)?.type).toBe('plateau');
  });

  it('does not flag a plateau for a 3% gain', () => {
    const moved = history([
      point('2026-07-01', 100),
      point('2026-07-08', 100),
      point('2026-07-15', 103),
      point('2026-07-22', 103),
    ]);
    expect(detectPlateau(moved)).toBeNull();
  });

  it('is not fooled by one bad session at the end', () => {
    // The recent window still holds a best equal to the baseline, so this is
    // flat rather than a decline — and either way it is not "progress".
    const offDay = history([
      point('2026-07-01', 100),
      point('2026-07-08', 102),
      point('2026-07-15', 102),
      point('2026-07-22', 85),
    ]);
    expect(detectPlateau(offDay)?.type).toBe('plateau');
  });

  it('requires the minimum span exactly', () => {
    const start = '2026-07-01';
    const justUnder = history([
      point(start, 100),
      point('2026-07-08', 100),
      point('2026-07-15', 100),
      point('2026-07-21', 100),
    ]);
    // 20 days: one short.
    expect(detectPlateau(justUnder)).toBeNull();

    const justOver = history([
      point(start, 100),
      point('2026-07-08', 100),
      point('2026-07-15', 100),
      point('2026-07-22', 100),
    ]);
    expect(justOver.points.length).toBe(PLATEAU_MIN_SESSIONS);
    expect(detectPlateau(justOver)?.facts.days).toBe(PLATEAU_MIN_DAYS);
  });

  it('does not depend on the points arriving in order', () => {
    // The interface documents oldest-first, but the endpoints are found by
    // comparing dates rather than by trusting the order — so a caller that
    // ever hands them over shuffled still gets the right span rather than a
    // negative one.
    const shuffled = history([
      point('2026-07-22', 101),
      point('2026-07-01', 100),
      point('2026-08-05', 101),
      point('2026-07-08', 100),
      point('2026-07-15', 100),
      point('2026-07-29', 101),
    ]);
    const ordered = detectPlateau(stalled);
    const scrambled = detectPlateau(shuffled);
    expect(scrambled?.facts.days).toBe(ordered?.facts.days);
    expect(scrambled?.facts.days).toBe(35);
  });

  it('ignores a history whose figures are all zero', () => {
    const empty = history([
      point('2026-07-01', 0),
      point('2026-07-08', 0),
      point('2026-07-15', 0),
      point('2026-07-22', 0),
    ]);
    expect(detectPlateau(empty)).toBeNull();
  });
});

describe('detectProgression', () => {
  const improving = history([
    point('2026-07-01', 100),
    point('2026-07-15', 106),
    point('2026-07-29', 112),
  ]);

  it('detects real improvement and reports a weekly rate', () => {
    const insight = detectProgression(improving);
    expect(insight?.type).toBe('progression');
    expect(insight?.facts.gainKg).toBe(12);
    expect(insight?.facts.gainPercent).toBe(12);
    // 12 kg over 28 days = 3 kg a week.
    expect(insight?.facts.perWeekKg).toBe(3);
  });

  it('reports a rate as well as a total, because a total alone misleads', () => {
    const slow = history([
      point('2026-01-01', 100),
      point('2026-03-01', 106),
      point('2026-06-01', 112),
    ]);
    const fast = detectProgression(improving);
    const gradual = detectProgression(slow);
    // The same 12 kg, wildly different rates.
    expect(gradual?.facts.gainKg).toBe(fast?.facts.gainKg);
    expect(Number(gradual?.facts.perWeekKg)).toBeLessThan(Number(fast?.facts.perWeekKg));
  });

  it('does not call noise progress', () => {
    const flat = history([
      point('2026-07-01', 100),
      point('2026-07-15', 101),
      point('2026-07-29', 102),
    ]);
    // 2% over a month is plate availability, not a gain.
    expect(detectProgression(flat)).toBeNull();
  });

  it('measures to the best session, not the last one', () => {
    // A deliberately light final session must not erase the block.
    const deload = history([
      point('2026-07-01', 100),
      point('2026-07-15', 115),
      point('2026-07-29', 90),
    ]);
    expect(detectProgression(deload)?.facts.bestE1RM).toBe(115);
  });

  it('requires enough sessions and enough time', () => {
    expect(
      detectProgression(history([point('2026-07-01', 100), point('2026-07-29', 120)])),
    ).toBeNull();

    const tooSoon = history([
      point('2026-07-01', 100),
      point('2026-07-05', 110),
      point('2026-07-10', 120),
    ]);
    expect(tooSoon.points.length).toBe(PROGRESSION_MIN_SESSIONS);
    expect(daysApart(tooSoon)).toBeLessThan(PROGRESSION_MIN_DAYS);
    expect(detectProgression(tooSoon)).toBeNull();
  });

  it('ignores a history starting from zero', () => {
    const fromZero = history([
      point('2026-07-01', 0),
      point('2026-07-15', 50),
      point('2026-07-29', 60),
    ]);
    expect(detectProgression(fromZero)).toBeNull();
  });
});

describe('detectImbalance', () => {
  it('reports the most lopsided pair', () => {
    const insight = detectImbalance([
      { group: 'chest', volumeKg: dec('12000') },
      { group: 'legs', volumeKg: dec('9000') },
      { group: 'back', volumeKg: dec('3000') },
    ]);
    expect(insight?.type).toBe('imbalance');
    expect(insight?.facts.mostGroup).toBe('chest');
    expect(insight?.facts.leastGroup).toBe('back');
    expect(insight?.facts.ratio).toBe(4);
  });

  it('stays quiet about an ordinary split', () => {
    // 1.5:1 between pushing and pulling is normal programming, not a fault.
    expect(
      detectImbalance([
        { group: 'chest', volumeKg: dec('9000') },
        { group: 'back', volumeKg: dec('6000') },
      ]),
    ).toBeNull();
  });

  it('describes rather than prescribes', () => {
    const insight = detectImbalance([
      { group: 'chest', volumeKg: dec('12000') },
      { group: 'back', volumeKg: dec('3000') },
    ]);
    // Someone mid-specialisation is not doing anything wrong, and this module
    // cannot tell that from neglect — so it must not tell them what to do.
    for (const word of ['should', 'need to', 'must', 'try', 'recommend']) {
      expect(insight?.title.toLowerCase()).not.toContain(word);
    }
  });

  it('ignores groups with no volume at all', () => {
    const insight = detectImbalance([
      { group: 'chest', volumeKg: dec('12000') },
      { group: 'back', volumeKg: dec('3000') },
      { group: 'arms', volumeKg: dec('0') },
    ]);
    // 'arms' at zero would make every ratio infinite and every user imbalanced.
    expect(insight?.facts.leastGroup).toBe('back');
  });

  it('does not depend on the groups arriving in any order', () => {
    // Same three groups, smallest first. The answer must not change.
    const insight = detectImbalance([
      { group: 'back', volumeKg: dec('3000') },
      { group: 'legs', volumeKg: dec('9000') },
      { group: 'chest', volumeKg: dec('12000') },
    ]);
    expect(insight?.facts.mostGroup).toBe('chest');
    expect(insight?.facts.leastGroup).toBe('back');
    expect(insight?.facts.ratio).toBe(4);
  });

  it('needs a meaningful amount of work before judging a ratio', () => {
    const justUnder = detectImbalance([
      { group: 'chest', volumeKg: dec(String(IMBALANCE_MIN_VOLUME_KG - 100)) },
      { group: 'back', volumeKg: dec('50') },
    ]);
    expect(justUnder).toBeNull();
  });
});

describe('summariseAdherence', () => {
  it('measures against the target the user chose', () => {
    const insight = summariseAdherence({ sessions: 12, days: 28, targetPerWeek: 3 });
    expect(insight?.facts.perWeek).toBe(3);
    expect(insight?.facts.targetPerWeek).toBe(3);
    expect(insight?.title).toContain('on plan');
  });

  it('does not call someone short who hit their own modest target', () => {
    // Two a week, target two a week. An app that calls this a shortfall has
    // substituted its opinion for the user's.
    const insight = summariseAdherence({ sessions: 8, days: 28, targetPerWeek: 2 });
    expect(insight?.title).toContain('on plan');
    expect(Number(insight?.facts.ratioPercent)).toBeGreaterThanOrEqual(100);
  });

  it('states the gap plainly when there is one', () => {
    const insight = summariseAdherence({ sessions: 4, days: 28, targetPerWeek: 4 });
    expect(insight?.title).toContain('target of 4');
    expect(insight?.facts.ratioPercent).toBe(25);
  });

  it('counts 90% of target as on plan', () => {
    // Missing one session in a month is not a failure worth flagging.
    const insight = summariseAdherence({ sessions: 11, days: 28, targetPerWeek: 3 });
    expect(insight?.title).toContain('on plan');
  });
});

describe('rankInsights', () => {
  const make = (type: Insight['type'], title: string): Insight => ({
    type,
    title,
    facts: {},
    basis: 'test',
  });

  it('puts a plateau first and a summary last', () => {
    const ranked = rankInsights([
      make('summary', 's'),
      make('imbalance', 'i'),
      make('plateau', 'p'),
      make('progression', 'g'),
    ]);
    expect(ranked.map((insight) => insight.type)).toEqual([
      'plateau',
      'progression',
      'imbalance',
      'summary',
    ]);
  });

  it('shows only one plateau, however many there are', () => {
    // Four plateau notices at once reads as a verdict on the person, and the
    // second is no more actionable than the first.
    const ranked = rankInsights([
      make('plateau', 'bench'),
      make('plateau', 'squat'),
      make('plateau', 'deadlift'),
      make('progression', 'row'),
    ]);
    expect(ranked.filter((insight) => insight.type === 'plateau')).toHaveLength(1);
    expect(ranked.map((insight) => insight.title)).toContain('bench');
  });

  it('caps the total', () => {
    const many = Array.from({ length: 10 }, (_, index) => make('progression', `exercise ${index}`));
    expect(rankInsights(many)).toHaveLength(MAX_INSIGHTS);
  });

  it('returns nothing for nothing', () => {
    expect(rankInsights([])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = [make('summary', 's'), make('plateau', 'p')];
    const copy = [...input];
    rankInsights(input);
    expect(input).toEqual(copy);
  });
});

/** Days between the first and last point of a history, for the tests above. */
function daysApart(subject: ExerciseHistory): number {
  const first = subject.points[0];
  const last = subject.points[subject.points.length - 1];
  if (!first || !last) return 0;
  return Math.round(
    (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / 86_400_000,
  );
}
