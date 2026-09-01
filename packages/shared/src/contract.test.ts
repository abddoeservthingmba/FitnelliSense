import { describe, expect, it } from 'vitest';
import { createMediaAssetRequestSchema, seedCatalogueSchema } from './index';
import { decimalStringSchema, paginationSchema, rpeSchema } from './primitives';
import { registerRequestSchema } from './auth';
import { listExercisesQuerySchema, createExerciseRequestSchema } from './exercise';
import { saveRoutineRequestSchema } from './routine';
import { httpStatusFor, isRetryable } from './errors';

describe('decimalStringSchema', () => {
  it('normalises numbers and strings to one string form', () => {
    expect(decimalStringSchema.parse(80)).toBe('80');
    expect(decimalStringSchema.parse('  82.5 ')).toBe('82.5');
  });

  it('rejects anything that is not a decimal', () => {
    expect(decimalStringSchema.safeParse('80kg').success).toBe(false);
    expect(decimalStringSchema.safeParse('1e5').success).toBe(false);
    expect(decimalStringSchema.safeParse(Number.NaN).success).toBe(false);
  });
});

describe('rpeSchema', () => {
  it('accepts half steps between 1 and 10', () => {
    expect(rpeSchema.parse(8.5)).toBe(8.5);
    expect(rpeSchema.safeParse(8.25).success).toBe(false);
    expect(rpeSchema.safeParse(11).success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('defaults the limit and coerces query strings', () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 20 });
    expect(paginationSchema.parse({ limit: '50' }).limit).toBe(50);
    expect(paginationSchema.safeParse({ limit: 500 }).success).toBe(false);
  });
});

describe('registerRequestSchema', () => {
  it('lowercases the email and enforces a passphrase length', () => {
    const parsed = registerRequestSchema.parse({
      email: 'Sam@Example.COM',
      password: 'correct horse battery',
      displayName: '  Sam  ',
    });
    expect(parsed.email).toBe('sam@example.com');
    expect(parsed.displayName).toBe('Sam');
    expect(registerRequestSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(
      false,
    );
  });
});

describe('listExercisesQuerySchema', () => {
  it('coerces the filters that arrive as query strings', () => {
    const parsed = listExercisesQuerySchema.parse({ muscleGroupId: '3', includeArchived: 'true' });
    expect(parsed.muscleGroupId).toBe(3);
    expect(parsed.includeArchived).toBe(true);
    expect(parsed.scope).toBe('all');
  });
});

describe('createExerciseRequestSchema', () => {
  it('requires at least one primary muscle (FR-EX-04)', () => {
    const base = { name: 'Cable Fly', isUnilateral: false };
    expect(
      createExerciseRequestSchema.safeParse({
        ...base,
        muscles: [{ muscleId: 1, role: 'secondary' }],
      }).success,
    ).toBe(false);
    expect(
      createExerciseRequestSchema.safeParse({
        ...base,
        muscles: [{ muscleId: 1, role: 'primary' }],
      }).success,
    ).toBe(true);
  });

  it('rejects the same muscle listed twice', () => {
    expect(
      createExerciseRequestSchema.safeParse({
        name: 'Cable Fly',
        muscles: [
          { muscleId: 1, role: 'primary' },
          { muscleId: 1, role: 'secondary' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('saveRoutineRequestSchema', () => {
  it('rejects an inverted rep range', () => {
    const result = saveRoutineRequestSchema.safeParse({
      name: 'Push A',
      exercises: [
        {
          exerciseId: '018f4b1e-0000-7000-8000-000000000001',
          targetRepsMin: 12,
          targetRepsMax: 8,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('createMediaAssetRequestSchema', () => {
  const base = {
    kind: 'image',
    sourceUrl: 'https://example.org/photo',
    sourceName: 'Example',
    licence: 'cc_by',
  };

  it('demands a location that matches the delivery mode (FR-MED-05)', () => {
    expect(createMediaAssetRequestSchema.safeParse({ ...base, delivery: 'r2_copy' }).success).toBe(
      false,
    );
    expect(
      createMediaAssetRequestSchema.safeParse({
        ...base,
        delivery: 'r2_copy',
        r2Key: 'exercises/bench.png',
      }).success,
    ).toBe(true);
    expect(
      createMediaAssetRequestSchema.safeParse({
        ...base,
        delivery: 'external_embed',
        r2Key: 'exercises/bench.png',
        externalUrl: 'https://example.org/photo.png',
      }).success,
    ).toBe(false);
  });

  it('demands attribution text when the licence requires it (FR-MED-04)', () => {
    expect(
      createMediaAssetRequestSchema.safeParse({
        ...base,
        delivery: 'external_embed',
        externalUrl: 'https://example.org/photo.png',
        requiresAttribution: true,
      }).success,
    ).toBe(false);
  });
});

describe('seedCatalogueSchema', () => {
  it('refuses seed media with an unknown licence (FR-MED-10)', () => {
    const catalogue = {
      version: 1,
      taxonomy: { muscleGroups: [], muscles: [], equipment: [] },
      exercises: [
        {
          slug: 'bench-press',
          name: 'Bench Press',
          primaryMuscles: ['pectoralis-major'],
          media: [
            {
              kind: 'image',
              delivery: 'r2_copy',
              r2Key: 'a.png',
              sourceUrl: 'https://example.org',
              sourceName: 'Example',
              licence: 'unknown',
            },
          ],
        },
      ],
    };
    expect(seedCatalogueSchema.safeParse(catalogue).success).toBe(false);
  });
});

describe('error envelope', () => {
  it('maps codes to status and marks the retryable ones', () => {
    expect(httpStatusFor('NOT_FOUND')).toBe(404);
    expect(httpStatusFor('SERVICE_UNAVAILABLE')).toBe(503);
    expect(isRetryable('SERVICE_UNAVAILABLE')).toBe(true);
    expect(isRetryable('VALIDATION_ERROR')).toBe(false);
  });
});
