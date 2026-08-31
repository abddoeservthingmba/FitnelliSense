/**
 * Taxonomy reads (FR-EX-03). Small, static and cacheable — the client fetches
 * this once and filters locally.
 */
import { asc } from 'drizzle-orm';
import type { TaxonomyResponse } from '@fi/shared';
import { equipment, muscleGroups, muscles } from '../db/schema.js';
import type { Database } from '../db/client.js';

export async function getTaxonomy(db: Database): Promise<TaxonomyResponse> {
  const [groups, allMuscles, allEquipment] = await Promise.all([
    db.select().from(muscleGroups).orderBy(asc(muscleGroups.name)),
    db.select().from(muscles).orderBy(asc(muscles.name)),
    db.select().from(equipment).orderBy(asc(equipment.name)),
  ]);

  return { muscleGroups: groups, muscles: allMuscles, equipment: allEquipment };
}
