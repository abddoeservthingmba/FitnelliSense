/**
 * Which lifts the form analyser can actually measure, and what to offer for the
 * ones it cannot.
 *
 * THE POINT OF THIS MODULE is that "we can analyse this" is a claim, and a
 * wrong claim is expensive in a specific way: the user films a set, waits for
 * an upload, and gets nothing — having done the work on the promise that it
 * would be measured. So support is an explicit, enumerated fact rather than a
 * guess from the exercise's `kind`.
 *
 * The previous behaviour offered filming for every `strength` exercise, which
 * is most of a 188-exercise catalogue. A cable fly is `strength`. So is a
 * dumbbell curl. Neither has a barbell, a plate to calibrate against, or a
 * single rule written for it.
 *
 * KEYED ON SLUG, not name and not id. Names get edited and re-cased, and ids
 * differ between the seed and any database that re-imported it. The slug is
 * the catalogue's stable identifier and is what `content/exercises.seed.json`
 * is keyed on.
 */

/** The exercise vocabulary the analyser itself understands (v0.1 scope). */
export type AnalyserExercise =
  | 'back_squat'
  | 'front_squat'
  | 'deadlift'
  | 'bench_press'
  | 'overhead_press';

/**
 * What filming a set of this exercise can produce.
 *
 * `measured` — the analyser has rules for it; video yields numbers.
 * `stored`   — video can be kept and watched back, but nothing is measured.
 *
 * There is deliberately no third option meaning "maybe". A user deciding
 * whether to set their phone up needs a yes or a no.
 */
export type AnalysisSupport = 'measured' | 'stored';

/**
 * Catalogue slug to analyser exercise.
 *
 * Deliberately a short, explicit list rather than pattern matching on the name.
 * `band-squat` and `belt-squat` both contain "squat" and neither is a back
 * squat; `close-grip-bench-press` is a bench press by geometry but its rules
 * for elbow flare would be wrong. Every entry here is a decision someone made,
 * and adding one means adding a golden-set clip for it too.
 */
const SUPPORTED: Readonly<Record<string, AnalyserExercise>> = {
  'back-squat': 'back_squat',
  'front-squat': 'front_squat',
  deadlift: 'deadlift',
  'conventional-deadlift': 'deadlift',
  'barbell-bench-press': 'bench_press',
  'overhead-press': 'overhead_press',
  'barbell-overhead-press': 'overhead_press',
};

/**
 * The analyser's name for this exercise, or null if it has none.
 *
 * A null here is not a failure — it is the common case, and the caller's job is
 * to offer video without analysis rather than to hide the feature.
 */
export function analyserExercise(slug: string | null): AnalyserExercise | null {
  if (slug === null) return null;
  return SUPPORTED[slug] ?? null;
}

/** What filming this exercise can produce. Total: every slug has an answer. */
export function analysisSupport(slug: string | null): AnalysisSupport {
  return analyserExercise(slug) === null ? 'stored' : 'measured';
}

/**
 * Whether analysis may be requested for this exercise.
 *
 * Separate from `analysisSupport` because the caller needs both: the support
 * level decides what the screen SAYS, and this decides whether the request is
 * allowed to carry `analyse: true`. Keeping them one function would tempt a
 * caller into inferring one from the other's string value.
 */
export function canRequestAnalysis(slug: string | null): boolean {
  return analysisSupport(slug) === 'measured';
}

/**
 * Which end of the movement a rep of this lift begins at.
 *
 * A SQUAT, A BENCH AND A PRESS START AT THE TOP: the bar is held at standing
 * or lockout height and the rep opens with the descent. A DEADLIFT STARTS ON
 * THE FLOOR, and its first movement is the pull.
 *
 * This is what `detectReps` needs to know, and getting it wrong does not
 * produce a small error — it counts the reps between the WRONG pair of turning
 * points, so a deadlift read as a squat pairs the lowering of one rep with the
 * pull of the next and reports the rest between them as part of a rep.
 *
 * Enumerated rather than inferred. There is no property of an exercise slug
 * that reveals which way it goes, and a default of 'top' would silently be
 * wrong for every pull.
 */
export function repStartsAt(exercise: AnalyserExercise): 'top' | 'bottom' {
  return exercise === 'deadlift' ? 'bottom' : 'top';
}

/**
 * The exercises the analyser supports, for a capture guide or a settings
 * screen. Sorted so the list is stable — an unsorted `Object.values` would
 * reorder on any edit to the map above and produce noise in a snapshot test.
 */
export function supportedExercises(): readonly AnalyserExercise[] {
  return [...new Set(Object.values(SUPPORTED))].sort();
}

/**
 * The slugs mapping to a given analyser exercise, so a capture guide can say
 * "Back Squat" rather than "back_squat".
 */
export function slugsFor(exercise: AnalyserExercise): readonly string[] {
  return Object.entries(SUPPORTED)
    .filter(([, value]) => value === exercise)
    .map(([slug]) => slug)
    .sort();
}
