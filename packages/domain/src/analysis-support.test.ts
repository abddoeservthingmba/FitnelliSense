import { describe, expect, it } from 'vitest';
import {
  analyserExercise,
  analysisSupport,
  canRequestAnalysis,
  slugsFor,
  supportedExercises,
} from './analysis-support';

describe('analyserExercise', () => {
  it('maps the five supported lifts', () => {
    expect(analyserExercise('back-squat')).toBe('back_squat');
    expect(analyserExercise('front-squat')).toBe('front_squat');
    expect(analyserExercise('deadlift')).toBe('deadlift');
    expect(analyserExercise('barbell-bench-press')).toBe('bench_press');
    expect(analyserExercise('overhead-press')).toBe('overhead_press');
  });

  it('returns null for an exercise with no rules', () => {
    expect(analyserExercise('dumbbell-curl')).toBeNull();
    expect(analyserExercise('cable-fly')).toBeNull();
  });

  it('returns null for a custom exercise with no slug', () => {
    // Custom exercises have `slug: null`. Nothing can be claimed about them.
    expect(analyserExercise(null)).toBeNull();
  });

  /*
   * The reason this module exists rather than matching on the name. All three
   * contain "squat" and none is a back squat; a substring match would have
   * promised measurements for every one of them.
   */
  it('does not match a lift merely because its name contains a supported one', () => {
    for (const slug of ['band-squat', 'belt-squat', 'bulgarian-split-squat', 'goblet-squat']) {
      expect(analyserExercise(slug)).toBeNull();
    }
    expect(analyserExercise('close-grip-bench-press')).toBeNull();
  });
});

describe('analysisSupport', () => {
  it('is total — every slug gets an answer', () => {
    for (const slug of ['back-squat', 'dumbbell-curl', '', 'nonsense-slug']) {
      expect(['measured', 'stored']).toContain(analysisSupport(slug));
    }
    expect(analysisSupport(null)).toBe('stored');
  });

  it('says stored, not unsupported, for a lift with no rules', () => {
    // The wording matters: video is still kept and watchable. "Unsupported"
    // would suggest filming is pointless, which it is not.
    expect(analysisSupport('dumbbell-curl')).toBe('stored');
  });
});

describe('canRequestAnalysis', () => {
  it('permits only the measured lifts', () => {
    expect(canRequestAnalysis('back-squat')).toBe(true);
    expect(canRequestAnalysis('dumbbell-curl')).toBe(false);
    expect(canRequestAnalysis(null)).toBe(false);
  });
});

describe('the supported list', () => {
  it('names exactly the v0.1 scope', () => {
    expect(supportedExercises()).toEqual([
      'back_squat',
      'bench_press',
      'deadlift',
      'front_squat',
      'overhead_press',
    ]);
  });

  it('is stable, so a snapshot of it does not churn on an unrelated edit', () => {
    expect(supportedExercises()).toEqual(supportedExercises());
    expect([...supportedExercises()]).toEqual([...supportedExercises()].sort());
  });

  it('resolves every supported exercise back to at least one slug', () => {
    for (const exercise of supportedExercises()) {
      const slugs = slugsFor(exercise);
      expect(slugs.length).toBeGreaterThan(0);
      for (const slug of slugs) {
        expect(analyserExercise(slug)).toBe(exercise);
      }
    }
  });

  it('accepts more than one slug for the same lift', () => {
    // The catalogue names deadlift twice; both must reach the same analyser
    // exercise or one of them silently loses analysis.
    expect(slugsFor('deadlift')).toContain('deadlift');
    expect(slugsFor('deadlift')).toContain('conventional-deadlift');
  });
});
