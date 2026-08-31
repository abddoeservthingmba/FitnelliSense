/**
 * The seed file is content, and content can be wrong. This test is the gate:
 * it runs in CI on every pull request that touches the catalogue.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RENDERABLE_LICENCES, seedCatalogueSchema } from '@fi/shared';
import { seedFilePath } from '../src/db/paths.js';

const catalogue = seedCatalogueSchema.parse(
  JSON.parse(readFileSync(seedFilePath(), 'utf8')) as unknown,
);

describe('content/exercises.seed.json', () => {
  it('ships at least 150 exercises (FR-EX-01)', () => {
    expect(catalogue.exercises.length).toBeGreaterThanOrEqual(150);
  });

  it('gives every exercise a unique slug', () => {
    const slugs = catalogue.exercises.map((exercise) => exercise.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every exercise at least one primary muscle (FR-EX-04)', () => {
    for (const exercise of catalogue.exercises) {
      expect(exercise.primaryMuscles.length, exercise.slug).toBeGreaterThan(0);
    }
  });

  it('only references muscles and equipment the taxonomy defines', () => {
    const muscles = new Set(catalogue.taxonomy.muscles.map((muscle) => muscle.slug));
    const equipment = new Set(catalogue.taxonomy.equipment.map((item) => item.slug));
    const groups = new Set(catalogue.taxonomy.muscleGroups.map((group) => group.slug));

    for (const muscle of catalogue.taxonomy.muscles) {
      expect(groups.has(muscle.muscleGroup), muscle.slug).toBe(true);
    }
    for (const exercise of catalogue.exercises) {
      for (const muscle of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
        expect(muscles.has(muscle), `${exercise.slug} -> ${muscle}`).toBe(true);
      }
      if (exercise.equipment) {
        expect(equipment.has(exercise.equipment), exercise.slug).toBe(true);
      }
    }
  });

  it('never lists the same muscle twice for one exercise', () => {
    for (const exercise of catalogue.exercises) {
      const all = [...exercise.primaryMuscles, ...exercise.secondaryMuscles];
      expect(new Set(all).size, exercise.slug).toBe(all.length);
    }
  });

  it('gives every exercise usable instructions, since v1 ships without media', () => {
    for (const exercise of catalogue.exercises) {
      expect(exercise.instructions?.length ?? 0, exercise.slug).toBeGreaterThan(30);
    }
  });

  it('carries only renderable licences on any media it does ship (FR-MED-10)', () => {
    for (const exercise of catalogue.exercises) {
      for (const media of exercise.media) {
        expect(RENDERABLE_LICENCES as readonly string[]).toContain(media.licence);
        if (media.requiresAttribution) expect(media.attributionText).toBeTruthy();
      }
    }
  });
});
