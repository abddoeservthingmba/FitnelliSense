/**
 * Catalogue export and import (FR-ADM-07, R11).
 *
 * Content is data, not code. This round-trip is what stops the seeded 150
 * exercises from ossifying inside a migration: export the live catalogue to
 * `content/exercises.seed.json`, review the diff in a pull request, import it
 * again anywhere. Import is idempotent and keyed on slugs, so re-running it
 * updates rather than duplicates.
 */
import { asc, eq, isNull, and } from 'drizzle-orm';
import { seedCatalogueSchema, type SeedCatalogue, type SeedExercise } from '@fi/shared';
import {
  equipment,
  exerciseMedia,
  exerciseMuscles,
  exercises,
  mediaAssets,
  muscleGroups,
  muscles,
} from '../db/schema.js';
import { badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import type { Database } from '../db/client.js';

export interface ImportStats {
  muscleGroups: number;
  muscles: number;
  equipment: number;
  exercisesCreated: number;
  exercisesUpdated: number;
  mediaAssets: number;
}

// ------------------------------------------------------------------- export --

export async function exportCatalogue(db: Database): Promise<SeedCatalogue> {
  const [groupRows, muscleRows, equipmentRows] = await Promise.all([
    db.select().from(muscleGroups).orderBy(asc(muscleGroups.slug)),
    db.select().from(muscles).orderBy(asc(muscles.slug)),
    db.select().from(equipment).orderBy(asc(equipment.slug)),
  ]);

  const groupSlugById = new Map(groupRows.map((row) => [row.id, row.slug]));
  const muscleSlugById = new Map(muscleRows.map((row) => [row.id, row.slug]));
  const equipmentSlugById = new Map(equipmentRows.map((row) => [row.id, row.slug]));

  const exerciseRows = await db
    .select()
    .from(exercises)
    .where(and(isNull(exercises.userId), isNull(exercises.archivedAt)))
    .orderBy(asc(exercises.slug));

  const muscleLinks = await db.select().from(exerciseMuscles);
  const mediaLinks = await db
    .select({ link: exerciseMedia, asset: mediaAssets })
    .from(exerciseMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, exerciseMedia.mediaId));

  const catalogueExercises: SeedExercise[] = exerciseRows.map((row) => {
    const links = muscleLinks.filter((link) => link.exerciseId === row.id);
    const media = mediaLinks.filter((entry) => entry.link.exerciseId === row.id);

    return {
      slug: row.slug ?? row.id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      equipment: row.equipmentId === null ? null : (equipmentSlugById.get(row.equipmentId) ?? null),
      isUnilateral: row.isUnilateral,
      primaryMuscles: links
        .filter((link) => link.role === 'primary')
        .map((link) => muscleSlugById.get(link.muscleId))
        .filter((slug): slug is string => slug !== undefined),
      secondaryMuscles: links
        .filter((link) => link.role === 'secondary')
        .map((link) => muscleSlugById.get(link.muscleId))
        .filter((slug): slug is string => slug !== undefined),
      movementPattern: null,
      media: media.map(({ link, asset }) => ({
        kind: asset.kind,
        delivery: asset.delivery,
        r2Key: asset.r2Key,
        externalUrl: asset.externalUrl,
        sourceUrl: asset.sourceUrl,
        sourceName: asset.sourceName,
        // FR-MED-10: an unlicensed asset must never round-trip into the seed.
        licence: asset.licence === 'unknown' ? 'original_work' : asset.licence,
        licenceUrl: asset.licenceUrl,
        attributionText: asset.attributionText,
        requiresAttribution: asset.requiresAttribution,
        isPrimary: link.isPrimary,
      })),
    };
  });

  return {
    version: 1,
    taxonomy: {
      muscleGroups: groupRows.map((row) => ({ slug: row.slug, name: row.name })),
      muscles: muscleRows.map((row) => ({
        slug: row.slug,
        name: row.name,
        muscleGroup: groupSlugById.get(row.muscleGroupId) ?? '',
      })),
      equipment: equipmentRows.map((row) => ({ slug: row.slug, name: row.name })),
    },
    exercises: catalogueExercises,
  };
}

// ------------------------------------------------------------------- import --

async function upsertTaxonomy(
  db: Database,
  catalogue: SeedCatalogue,
): Promise<{
  groups: Map<string, number>;
  muscles: Map<string, number>;
  equipment: Map<string, number>;
  counts: Pick<ImportStats, 'muscleGroups' | 'muscles' | 'equipment'>;
}> {
  for (const group of catalogue.taxonomy.muscleGroups) {
    await db
      .insert(muscleGroups)
      .values(group)
      .onConflictDoUpdate({ target: muscleGroups.slug, set: { name: group.name } });
  }
  const groupRows = await db.select().from(muscleGroups);
  const groups = new Map(groupRows.map((row) => [row.slug, row.id]));

  for (const muscle of catalogue.taxonomy.muscles) {
    const groupId = groups.get(muscle.muscleGroup);
    if (groupId === undefined) {
      throw badRequest(`Muscle "${muscle.slug}" names an unknown group "${muscle.muscleGroup}"`);
    }
    await db
      .insert(muscles)
      .values({ slug: muscle.slug, name: muscle.name, muscleGroupId: groupId })
      .onConflictDoUpdate({
        target: muscles.slug,
        set: { name: muscle.name, muscleGroupId: groupId },
      });
  }
  const muscleRows = await db.select().from(muscles);

  for (const item of catalogue.taxonomy.equipment) {
    await db
      .insert(equipment)
      .values(item)
      .onConflictDoUpdate({ target: equipment.slug, set: { name: item.name } });
  }
  const equipmentRows = await db.select().from(equipment);

  return {
    groups,
    muscles: new Map(muscleRows.map((row) => [row.slug, row.id])),
    equipment: new Map(equipmentRows.map((row) => [row.slug, row.id])),
    counts: {
      muscleGroups: catalogue.taxonomy.muscleGroups.length,
      muscles: catalogue.taxonomy.muscles.length,
      equipment: catalogue.taxonomy.equipment.length,
    },
  };
}

/**
 * Media is replaced wholesale for the exercise being imported. Assets are
 * created already verified, because the seed file's licence field is the
 * verification: the schema refuses `unknown`, so nothing unlicensed can reach
 * an `active` row (FR-MED-03, FR-MED-10).
 */
async function replaceMedia(
  db: Database,
  exerciseId: string,
  seed: SeedExercise,
  verifiedBy: string | null,
): Promise<number> {
  await db.delete(exerciseMedia).where(eq(exerciseMedia.exerciseId, exerciseId));
  if (seed.media.length === 0) return 0;

  const now = new Date();
  for (const [index, item] of seed.media.entries()) {
    const provenance = {
      kind: item.kind,
      delivery: item.delivery,
      state: 'active' as const,
      r2Key: item.r2Key ?? null,
      externalUrl: item.externalUrl ?? null,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      licence: item.licence,
      licenceUrl: item.licenceUrl ?? null,
      attributionText: item.attributionText ?? null,
      requiresAttribution: item.requiresAttribution,
      verifiedAt: now,
      verifiedBy,
      updatedAt: now,
    };

    // Re-importing must not leak a new asset row for the same file every time,
    // and assets cannot be deleted (ON DELETE RESTRICT), so an existing asset
    // for the same source is updated in place.
    const [existingAsset] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.sourceUrl, item.sourceUrl))
      .limit(1);

    const mediaId = existingAsset?.id ?? newId();
    if (existingAsset) {
      await db.update(mediaAssets).set(provenance).where(eq(mediaAssets.id, mediaId));
    } else {
      await db.insert(mediaAssets).values({ id: mediaId, ...provenance });
    }
    await db.insert(exerciseMedia).values({
      exerciseId,
      mediaId,
      position: index,
      isPrimary: item.isPrimary || index === 0,
    });
  }
  return seed.media.length;
}

export async function importCatalogue(
  db: Database,
  input: unknown,
  options: { verifiedBy?: string | null } = {},
): Promise<ImportStats> {
  const parsed = seedCatalogueSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest(
      'That seed file is not valid',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  const catalogue = parsed.data;

  const taxonomy = await upsertTaxonomy(db, catalogue);
  const stats: ImportStats = {
    ...taxonomy.counts,
    exercisesCreated: 0,
    exercisesUpdated: 0,
    mediaAssets: 0,
  };

  for (const seed of catalogue.exercises) {
    const equipmentId = seed.equipment ? taxonomy.equipment.get(seed.equipment) : undefined;
    if (seed.equipment && equipmentId === undefined) {
      throw badRequest(`Exercise "${seed.slug}" names unknown equipment "${seed.equipment}"`);
    }

    const [existing] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.slug, seed.slug), isNull(exercises.userId)))
      .limit(1);

    const exerciseId = existing?.id ?? newId();
    const values = {
      name: seed.name,
      description: seed.description ?? null,
      instructions: seed.instructions ?? null,
      equipmentId: equipmentId ?? null,
      isUnilateral: seed.isUnilateral,
      metadata: seed.movementPattern ? { movementPattern: seed.movementPattern } : {},
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(exercises).set(values).where(eq(exercises.id, exerciseId));
      stats.exercisesUpdated += 1;
    } else {
      await db.insert(exercises).values({ id: exerciseId, userId: null, slug: seed.slug, ...values });
      stats.exercisesCreated += 1;
    }

    await db.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, exerciseId));
    const links = [
      ...seed.primaryMuscles.map((slug) => ({ slug, role: 'primary' as const })),
      ...seed.secondaryMuscles.map((slug) => ({ slug, role: 'secondary' as const })),
    ];
    for (const link of links) {
      const muscleId = taxonomy.muscles.get(link.slug);
      if (muscleId === undefined) {
        throw badRequest(`Exercise "${seed.slug}" names unknown muscle "${link.slug}"`);
      }
      await db
        .insert(exerciseMuscles)
        .values({ exerciseId, muscleId, role: link.role })
        .onConflictDoNothing();
    }

    stats.mediaAssets += await replaceMedia(db, exerciseId, seed, options.verifiedBy ?? null);
  }

  return stats;
}
