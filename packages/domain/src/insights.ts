/**
 * Training insights — FR-AI-04, FR-AI-09.
 *
 * Every number an insight quotes is computed here, deterministically, from
 * logged data. A model may later be given these figures to phrase into a
 * sentence, but it never calculates one: FR-AI-09 says the model phrases, and
 * this module is the half that does the arithmetic.
 *
 * That separation is why this file has no AI in it at all, and why it is
 * useful without one. Rendered as plain statistics these are already the
 * insights; prose is a presentation layer on top.
 *
 * **The hardest requirement here is silence.** An insight engine that always
 * has something to say is worthless, because a user learns within a week that
 * the output is noise and stops reading it. Every function below returns
 * `null` when the data cannot support a conclusion, and the thresholds are set
 * so that two sessions and a bad night's sleep do not become "you have
 * plateaued".
 *
 * Nothing here prescribes. "Your bench has not moved in six weeks" is an
 * observation about the user's own data. "You should switch to 5×5" is
 * programming advice, and this module does not give it.
 */
import { decToNumber, type Dec } from './decimal';

/** What every insight carries, whatever its type. */
export interface Insight {
  readonly type: 'plateau' | 'progression' | 'imbalance' | 'summary';
  /** A short line, already true without any rephrasing. */
  readonly title: string;
  /** The figures behind it, so the UI can render them itself (FR-AI-09). */
  readonly facts: Readonly<Record<string, number | string>>;
  /**
   * Why this conclusion is supportable — sessions counted, weeks spanned.
   *
   * Carried so a reader can judge the claim rather than take it on faith, and
   * so a model given these facts can say "over six sessions" rather than
   * inventing a span.
   */
  readonly basis: string;
}

/** One session's best effort at one exercise. */
export interface ExercisePoint {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Best estimated 1RM of the session, from `estimate1RM`. */
  readonly bestE1RM: Dec;
  /** Total volume for that exercise in that session. */
  readonly volumeKg: Dec;
}

export interface ExerciseHistory {
  readonly exerciseId: string;
  readonly exerciseName: string;
  /** Oldest first. */
  readonly points: readonly ExercisePoint[];
}

const DAY_MS = 86_400_000;

/**
 * The earliest and latest point of a series, and the days between them.
 *
 * Written with `reduce` rather than `points[0]` because TypeScript types a
 * no-initial-value reduce as `T` rather than `T | undefined` — so there is no
 * optional to guard, and therefore no unreachable guard for the 100% coverage
 * bar to fail on. Every caller checks the length first, which is what makes
 * the reduce safe.
 */
function endpoints(points: readonly ExercisePoint[]): {
  earliest: ExercisePoint;
  latest: ExercisePoint;
  spanDays: number;
} {
  const earliest = points.reduce((a, b) => (a.date <= b.date ? a : b));
  const latest = points.reduce((a, b) => (a.date >= b.date ? a : b));
  return { earliest, latest, spanDays: daysBetween(earliest.date, latest.date) };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// ------------------------------------------------------------- plateau --

/**
 * The minimum evidence before the word "plateau" is used.
 *
 * Four sessions across three weeks. Three sessions in one week is a heavy
 * week, not a trend, and calling it a plateau would be both wrong and
 * discouraging at exactly the wrong moment.
 */
export const PLATEAU_MIN_SESSIONS = 4;
export const PLATEAU_MIN_DAYS = 21;

/**
 * How much improvement still counts as flat.
 *
 * 2%: on a 100 kg bench that is 2 kg, which is about the smallest increment
 * most gyms can actually load. Below that the difference is plate availability
 * and daily variation, not progress.
 */
const PLATEAU_TOLERANCE = 0.02;

/**
 * Detects a stalled exercise, or returns null.
 *
 * The test is deliberately not "the last session was not a record" — everyone
 * has an off day. It is that the best effort in the recent window has not
 * exceeded the best effort before it, across enough sessions and enough time
 * for that to mean something.
 */
export function detectPlateau(history: ExerciseHistory): Insight | null {
  const points = history.points;
  if (points.length < PLATEAU_MIN_SESSIONS) return null;

  const { spanDays: span } = endpoints(points);
  if (span < PLATEAU_MIN_DAYS) return null;

  // Split in half: the earlier window establishes a baseline, the recent one
  // is what is being judged. An even split keeps both halves meaningful
  // rather than comparing five sessions against one.
  // Length is at least PLATEAU_MIN_SESSIONS, so both halves are non-empty by
  // construction rather than by a check that can never fail.
  const middle = Math.floor(points.length / 2);
  const earlier = points.slice(0, middle);
  const recent = points.slice(middle);

  const bestOf = (window: readonly ExercisePoint[]): number =>
    Math.max(...window.map((point) => decToNumber(point.bestE1RM)));

  const baseline = bestOf(earlier);
  const current = bestOf(recent);
  if (baseline <= 0) return null;

  const change = (current - baseline) / baseline;
  if (change > PLATEAU_TOLERANCE) return null;

  // The full observed span, not just the recent half: the earlier half showed
  // no improvement either, so the whole window is the honest figure — and it
  // avoids indexing `recent[0]`, whose undefined arm could never be reached.
  return {
    type: 'plateau',
    title: `${history.exerciseName} has not moved in ${weeksOf(span)}`,
    facts: {
      exerciseId: history.exerciseId,
      exerciseName: history.exerciseName,
      baselineE1RM: round2(baseline),
      currentE1RM: round2(current),
      changePercent: round2(change * 100),
      sessions: points.length,
      days: span,
    },
    basis: `${points.length} sessions over ${weeksOf(span)}`,
  };
}

// --------------------------------------------------------- progression --

export const PROGRESSION_MIN_SESSIONS = 3;
export const PROGRESSION_MIN_DAYS = 14;
/** Below this the "gain" is rounding and plate availability. */
const PROGRESSION_MIN_PERCENT = 0.03;

/**
 * Detects real improvement, or returns null.
 *
 * Reported as a rate per week as well as a total, because "5 kg" means very
 * different things over three weeks and over three months, and the total alone
 * invites the wrong conclusion.
 */
export function detectProgression(history: ExerciseHistory): Insight | null {
  const points = history.points;
  if (points.length < PROGRESSION_MIN_SESSIONS) return null;

  const { earliest, spanDays: span } = endpoints(points);
  if (span < PROGRESSION_MIN_DAYS) return null;

  // Earliest against best, not earliest against latest: a light session at the
  // end of a hard block should not erase a month of progress.
  const start = decToNumber(earliest.bestE1RM);
  const best = Math.max(...points.map((point) => decToNumber(point.bestE1RM)));
  if (start <= 0) return null;

  const change = (best - start) / start;
  if (change < PROGRESSION_MIN_PERCENT) return null;

  const perWeek = ((best - start) / span) * 7;

  return {
    type: 'progression',
    title: `${history.exerciseName} is up ${round2(best - start)} kg in ${weeksOf(span)}`,
    facts: {
      exerciseId: history.exerciseId,
      exerciseName: history.exerciseName,
      startE1RM: round2(start),
      bestE1RM: round2(best),
      gainKg: round2(best - start),
      gainPercent: round2(change * 100),
      perWeekKg: round2(perWeek),
      sessions: points.length,
      days: span,
    },
    basis: `${points.length} sessions over ${weeksOf(span)}`,
  };
}

// ----------------------------------------------------------- imbalance --

export interface GroupVolume {
  readonly group: string;
  readonly volumeKg: Dec;
}

/**
 * The ratio at which a difference is worth mentioning.
 *
 * 2.5:1. A 1.5:1 split between pushing and pulling is ordinary programming;
 * flagging it would make the feature a nag. At 2.5:1 something deliberate or
 * neglected is happening, and either way it is worth the user knowing.
 */
export const IMBALANCE_RATIO = 2.5;
/** Below this there is not enough work logged for a ratio to mean anything. */
export const IMBALANCE_MIN_VOLUME_KG = 2000;

/**
 * The most lopsided pair of muscle groups, or null.
 *
 * Deliberately descriptive. Someone in a specialisation block is not doing
 * anything wrong, and this module cannot tell that case apart from neglect —
 * so it reports the ratio and says nothing about what to do.
 */
export function detectImbalance(groups: readonly GroupVolume[]): Insight | null {
  const withVolume = groups
    .map((entry) => ({ group: entry.group, volume: decToNumber(entry.volumeKg) }))
    .filter((entry) => entry.volume > 0);

  if (withVolume.length < 2) return null;

  const total = withVolume.reduce((sum, entry) => sum + entry.volume, 0);
  if (total < IMBALANCE_MIN_VOLUME_KG) return null;

  // `reduce` again, for the same reason as `endpoints`: it yields a definite
  // element, so there is no undefined arm to guard. `withVolume` is already
  // filtered to positive volumes, so the division below cannot be by zero.
  const most = withVolume.reduce((a, b) => (a.volume >= b.volume ? a : b));
  const least = withVolume.reduce((a, b) => (a.volume <= b.volume ? a : b));

  const ratio = most.volume / least.volume;
  if (ratio < IMBALANCE_RATIO) return null;

  return {
    type: 'imbalance',
    title: `${most.group} has had ${round1(ratio)}× the volume of ${least.group}`,
    facts: {
      mostGroup: most.group,
      mostVolumeKg: round2(most.volume),
      leastGroup: least.group,
      leastVolumeKg: round2(least.volume),
      ratio: round1(ratio),
      totalVolumeKg: round2(total),
    },
    basis: `${round2(total)} kg across ${withVolume.length} muscle groups`,
  };
}

// ------------------------------------------------------------ adherence --

export interface AdherenceInput {
  /** Sessions completed in the window. */
  readonly sessions: number;
  /** Days the window covers. */
  readonly days: number;
  /** From the profile. Null when the user never answered. */
  readonly targetPerWeek: number | null;
}

/**
 * How the last few weeks compare to the user's own stated target.
 *
 * Against *their* target, never an invented one. Someone who said two days a
 * week and trained twice a week is doing exactly what they set out to do, and
 * an app that calls that a shortfall has substituted its own opinion for
 * theirs. Returns null when there is no target to compare against.
 */
export function summariseAdherence(input: AdherenceInput): Insight | null {
  if (input.targetPerWeek === null || input.targetPerWeek <= 0) return null;
  if (input.days < 14) return null;

  // Both factors are already known positive — the target by the guard above,
  // the weeks by the 14-day minimum — so there is no zero case to check for.
  const weeks = input.days / 7;
  const expected = input.targetPerWeek * weeks;
  const actual = input.sessions / weeks;
  const ratio = input.sessions / expected;

  return {
    type: 'summary',
    title:
      ratio >= 0.9
        ? `${round1(actual)} sessions a week — on plan`
        : `${round1(actual)} sessions a week, against a target of ${input.targetPerWeek}`,
    facts: {
      sessions: input.sessions,
      perWeek: round1(actual),
      targetPerWeek: input.targetPerWeek,
      expected: Math.round(expected),
      ratioPercent: round2(ratio * 100),
      days: input.days,
    },
    basis: `${input.sessions} sessions in the last ${weeksOf(input.days)}`,
  };
}

// ------------------------------------------------------------- ranking --

/**
 * Chooses which insights to show, most useful first.
 *
 * Capped, and one plateau at a time. Four plateau notices at once reads as a
 * verdict on the user rather than as information, and the second and third are
 * not more actionable than the first.
 */
export const MAX_INSIGHTS = 4;

const TYPE_ORDER: Record<Insight['type'], number> = {
  plateau: 0,
  progression: 1,
  imbalance: 2,
  summary: 3,
};

export function rankInsights(insights: readonly Insight[]): Insight[] {
  const seenPlateau = { count: 0 };

  return [...insights]
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .filter((insight) => {
      if (insight.type !== 'plateau') return true;
      seenPlateau.count += 1;
      return seenPlateau.count === 1;
    })
    .slice(0, MAX_INSIGHTS);
}

// ------------------------------------------------------------ helpers --

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A span in weeks, phrased for a sentence.
 *
 * Rounded to whole weeks because "3.4 weeks" is a figure nobody says, and the
 * precision is false anyway — it depends on which day someone happened to
 * train.
 *
 * Always plural, with no singular special case. Every caller enforces a
 * minimum window of at least fourteen days, so a span can never round to one
 * week — a "a week" branch here would be unreachable, and an unreachable
 * branch is a lie about what the code can do.
 */
function weeksOf(days: number): string {
  return `${Math.max(2, Math.round(days / 7))} weeks`;
}
