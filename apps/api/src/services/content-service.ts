/**
 * Catalogue export and import (FR-ADM-07, R11).
 *
 * Content is data, not code. This round-trip is what stops the seeded 150
 * exercises from ossifying inside a migration: export the live catalogue to
 * `content/exercises.seed.json`, review the diff in a pull request, import it
 * again anywhere. Import is idempotent and keyed on slugs, so re-running it
 * updates rather than duplicates.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { seedCatalogueSchema, type SeedCatalogue, type SeedExercise } from '@fi/shared';
import {
  equipment,
  exerciseMedia,
  exerciseMuscles,
  exercises,
  mediaAssets,
  muscleGroups,
  muscles,
} from '../db/schema';
import { badRequest } from '../lib/errors';
import { newId } from '../lib/ids';
import type { Database } from '../db/client';

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
      kind: row.kind,
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
 * What identifies an asset as "the same file" across re-imports.
 *
 * Deliberately not `sourceUrl`. That works when the field names one file, but a
 * whole dataset shares one source URL — every image then resolved to the same
 * asset row, and the second frame of each exercise violated the
 * (exercise_id, media_id) primary key.
 */
function locationKey(item: SeedExercise['media'][number]): string {
  return item.r2Key ? `r2:${item.r2Key}` : `url:${item.externalUrl ?? ''}`;
}

/**
 * Every existing asset, keyed by location.
 *
 * Loaded once for the whole import rather than queried per media item. With 142
 * media entries that was 142 round trips before anything was written, which on
 * a remote Postgres is most of the import's wall-clock time.
 */
async function loadAssetIndex(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: mediaAssets.id, r2Key: mediaAssets.r2Key, externalUrl: mediaAssets.externalUrl })
    .from(mediaAssets);

  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(row.r2Key ? `r2:${row.r2Key}` : `url:${row.externalUrl ?? ''}`, row.id);
  }
  return index;
}

/**
 * The provenance record for one seed media entry (FR-MED-02).
 *
 * Assets are created already verified, because the seed file's licence field
 * *is* the verification: the schema refuses `unknown`, so nothing unlicensed
 * can reach an `active` row (FR-MED-03, FR-MED-10).
 */
function provenanceOf(
  item: SeedExercise['media'][number],
  verifiedBy: string | null,
  now: Date,
): typeof mediaAssets.$inferInsert {
  return {
    id: newId(),
    kind: item.kind,
    delivery: item.delivery,
    state: 'active',
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

  /*
   * The import runs in bulk phases rather than a loop of single-row
   * statements.
   *
   * The catalogue is 169 exercises with 142 media entries. Done row by row that
   * is well over 700 sequential round trips, and against a remote Postgres it
   * took ninety seconds and eventually outran the test harness's hook timeout.
   * The same work as a dozen statements is a few seconds, and `pnpm db:seed` is
   * something the runbook asks people to run.
   *
   * Everything below is still idempotent and still keyed on slugs.
   */
  const now = new Date();
  const assetIndex = await loadAssetIndex(db);
  const existingBySlug = new Map(
    (
      await db
        .select({ id: exercises.id, slug: exercises.slug })
        .from(exercises)
        .where(isNull(exercises.userId))
    ).map((row) => [row.slug ?? '', row.id]),
  );

  // ---- resolve every id and validate every reference before writing anything.
  const planned = catalogue.exercises.map((seed) => {
    const equipmentId = seed.equipment ? taxonomy.equipment.get(seed.equipment) : undefined;
    if (seed.equipment && equipmentId === undefined) {
      throw badRequest(`Exercise "${seed.slug}" names unknown equipment "${seed.equipment}"`);
    }

    const existingId = existingBySlug.get(seed.slug);
    return { seed, id: existingId ?? newId(), isNew: existingId === undefined, equipmentId };
  });

  stats.exercisesCreated = planned.filter((entry) => entry.isNew).length;
  stats.exercisesUpdated = planned.length - stats.exercisesCreated;

  // ---- exercises: one upsert for the lot.
  if (planned.length > 0) {
    await db
      .insert(exercises)
      .values(
        planned.map(({ seed, id, equipmentId }) => ({
          id,
          userId: null,
          slug: seed.slug,
          name: seed.name,
          description: seed.description ?? null,
          instructions: seed.instructions ?? null,
          equipmentId: equipmentId ?? null,
          kind: seed.kind,
          isUnilateral: seed.isUnilateral,
          metadata: seed.movementPattern ? { movementPattern: seed.movementPattern } : {},
          updatedAt: now,
        })),
      )
      // The unique index on slug is partial (WHERE user_id IS NULL), so the
      // conflict target has to repeat that predicate — a bare `(slug)` target
      // does not match a partial index and Postgres rejects it.
      .onConflictDoUpdate({
        target: exercises.slug,
        targetWhere: isNull(exercises.userId),
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          instructions: sql`excluded.instructions`,
          equipmentId: sql`excluded.equipment_id`,
          kind: sql`excluded.kind`,
          isUnilateral: sql`excluded.is_unilateral`,
          metadata: sql`excluded.metadata`,
          updatedAt: now,
        },
      });
  }

  const exerciseIds = planned.map((entry) => entry.id);

  // ---- muscle links: replaced wholesale, in two statements.
  await db.delete(exerciseMuscles).where(inArray(exerciseMuscles.exerciseId, exerciseIds));

  const muscleLinks = planned.flatMap(({ seed, id }) =>
    [
      ...seed.primaryMuscles.map((slug) => ({ slug, role: 'primary' as const })),
      ...seed.secondaryMuscles.map((slug) => ({ slug, role: 'secondary' as const })),
    ].map((link) => {
      const muscleId = taxonomy.muscles.get(link.slug);
      if (muscleId === undefined) {
        throw badRequest(`Exercise "${seed.slug}" names unknown muscle "${link.slug}"`);
      }
      return { exerciseId: id, muscleId, role: link.role };
    }),
  );
  if (muscleLinks.length > 0) {
    // The conflict clause still matters: a seed file may name a muscle twice.
    await db.insert(exerciseMuscles).values(muscleLinks).onConflictDoNothing();
  }

  // ---- media. Assets cannot be deleted (ON DELETE RESTRICT), so an existing
  // asset for the same file is updated in place; re-importing must not leak a
  // new row per run.
  await db.delete(exerciseMedia).where(inArray(exerciseMedia.exerciseId, exerciseIds));

  const newAssets: (typeof mediaAssets.$inferInsert)[] = [];
  const updatedAssets: (typeof mediaAssets.$inferInsert)[] = [];
  const mediaLinks: (typeof exerciseMedia.$inferInsert)[] = [];

  for (const { seed, id } of planned) {
    for (const [index, item] of seed.media.entries()) {
      const key = locationKey(item);
      const existingId = assetIndex.get(key);
      const record = provenanceOf(item, options.verifiedBy ?? null, now);
      const mediaId = existingId ?? record.id;

      if (existingId === undefined) {
        // Recorded immediately, so a second entry for the same file later in
        // this same import reuses the row rather than colliding on the link.
        assetIndex.set(key, mediaId);
        newAssets.push(record);
      } else {
        updatedAssets.push({ ...record, id: existingId });
      }

      mediaLinks.push({
        exerciseId: id,
        mediaId,
        position: index,
        isPrimary: item.isPrimary || index === 0,
      });
    }
  }

  if (newAssets.length > 0) await db.insert(mediaAssets).values(newAssets);

  if (updatedAssets.length > 0) {
    // Refreshing an existing asset is an insert-on-conflict on its primary key,
    // which is how a bulk update of differing values becomes one statement.
    await db
      .insert(mediaAssets)
      .values(updatedAssets)
      .onConflictDoUpdate({
        target: mediaAssets.id,
        set: {
          kind: sql`excluded.kind`,
          delivery: sql`excluded.delivery`,
          state: sql`excluded.state`,
          r2Key: sql`excluded.r2_key`,
          externalUrl: sql`excluded.external_url`,
          sourceUrl: sql`excluded.source_url`,
          sourceName: sql`excluded.source_name`,
          licence: sql`excluded.licence`,
          licenceUrl: sql`excluded.licence_url`,
          attributionText: sql`excluded.attribution_text`,
          requiresAttribution: sql`excluded.requires_attribution`,
          verifiedAt: now,
          verifiedBy: sql`excluded.verified_by`,
          updatedAt: now,
        },
      });
  }

  if (mediaLinks.length > 0) await db.insert(exerciseMedia).values(mediaLinks);
  stats.mediaAssets = mediaLinks.length;

  return stats;
}
