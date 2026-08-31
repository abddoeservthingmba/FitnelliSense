/**
 * Profile reads and writes (FR-AUTH-07..10).
 */
import { eq } from 'drizzle-orm';
import type { MeResponse, UpdateProfileRequest } from '@fi/shared';
import { userProfiles, users } from '../db/schema';
import { notFound } from '../lib/errors';
import type { Database } from '../db/client';
import type { Storage } from '../lib/r2';

export interface ProfileDeps {
  readonly db: Database;
  readonly storage: Storage;
  readonly avatarUrlTtlSecs: number;
}

export async function getMe(deps: ProfileDeps, userId: string): Promise<MeResponse> {
  const [row] = await deps.db
    .select({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      displayName: userProfiles.displayName,
      units: userProfiles.units,
      experience: userProfiles.experience,
      bodyweightKg: userProfiles.bodyweightKg,
      dateOfBirth: userProfiles.dateOfBirth,
      defaultRestSecs: userProfiles.defaultRestSecs,
      aiEnabled: userProfiles.aiEnabled,
      avatarR2Key: userProfiles.avatarR2Key,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) throw notFound('That account could not be found');

  const avatarUrl = row.avatarR2Key
    ? await deps.storage.signDownload(row.avatarR2Key, deps.avatarUrlTtlSecs)
    : null;

  return {
    id: row.id,
    email: row.email,
    isAdmin: row.isAdmin,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    profile: {
      displayName: row.displayName,
      units: row.units,
      experience: row.experience,
      bodyweightKg: row.bodyweightKg,
      dateOfBirth: row.dateOfBirth,
      defaultRestSecs: row.defaultRestSecs,
      aiEnabled: row.aiEnabled,
    },
    avatarUrl,
  };
}

export async function updateProfile(
  deps: ProfileDeps,
  userId: string,
  input: UpdateProfileRequest & { avatarR2Key?: string | null },
): Promise<MeResponse> {
  // Only the keys actually present are written, so a PATCH never clears a
  // field the client did not mention.
  const patch: Partial<typeof userProfiles.$inferInsert> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.units !== undefined) patch.units = input.units;
  if (input.experience !== undefined) patch.experience = input.experience;
  if (input.bodyweightKg !== undefined) patch.bodyweightKg = input.bodyweightKg;
  if (input.dateOfBirth !== undefined) patch.dateOfBirth = input.dateOfBirth;
  if (input.defaultRestSecs !== undefined) patch.defaultRestSecs = input.defaultRestSecs;
  if (input.aiEnabled !== undefined) patch.aiEnabled = input.aiEnabled;
  if (input.avatarR2Key !== undefined) patch.avatarR2Key = input.avatarR2Key;

  await deps.db.update(userProfiles).set(patch).where(eq(userProfiles.userId, userId));
  return getMe(deps, userId);
}

/**
 * FR-AUTH-10 / NFR-S-09. A soft delete now, with the row cascade and the R2
 * objects removed by the grace-period job (NFR-B-05). The email is released so
 * the address can be reused, and every session is already revoked by the caller.
 */
export async function markAccountDeleted(deps: ProfileDeps, userId: string): Promise<void> {
  const now = new Date();
  await deps.db
    .update(users)
    .set({
      deletedAt: now,
      updatedAt: now,
      // Anonymised immediately; the row itself is removed by the grace job.
      email: `deleted+${userId}@invalid`,
      passwordHash: 'deleted',
    })
    .where(eq(users.id, userId));
}
