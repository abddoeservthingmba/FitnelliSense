/**
 * Form analysis: issuing an upload target, and reading a result back.
 *
 * The video never passes through this API. The client is handed a presigned
 * PUT and talks to R2 directly — which is not only cheaper but the only thing
 * that works: a free Render instance has neither the bandwidth nor the memory
 * to proxy 80 MB uploads, and would fall over on the second concurrent one.
 *
 * Every function here is scoped by ownership before it touches a row, and a
 * miss answers 404 rather than 403 (NFR-S-03) — a video is more personal than
 * a set, so an id that leaks whether someone else's analysis exists is worse
 * here than anywhere else in the app.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Analysis, RequestVideoUpload, VideoUploadTarget } from '@fi/shared';
import { clipWindow } from '@fi/domain';
import { cvAnalyses, userProfiles, workoutExercises, workoutSets, workouts } from '../db/schema';
import { keys, type Storage } from '../lib/r2';
import { conflict, forbidden, notFound, serviceUnavailable } from '../lib/errors';
import { newId } from '../lib/ids';
import type { Database } from '../db/client';

/**
 * How long a playback URL lives.
 *
 * Short, because the URL is a bearer token for the object: anyone holding it
 * can fetch the video until it expires. Long enough to start playing a clip
 * and scrub back through it.
 */
const PLAYBACK_TTL_SECS = 300;

/** How long the client has to complete the upload it just asked for. */
const UPLOAD_TTL_SECS = 600;

/** The set must belong to the caller. Proven by joining upward to the workout. */
async function ownedSet(db: Database, userId: string, setId: string): Promise<void> {
  const [row] = await db
    .select({ id: workoutSets.id })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutSets.id, setId), eq(workouts.userId, userId)))
    .limit(1);

  if (!row) throw notFound('That set could not be found');
}

/**
 * Creates the analysis row and returns somewhere to put the video.
 *
 * The row is created FIRST and its id is the reference id. Doing it the other
 * way round — upload, then record — leaves an object in the bucket that
 * nothing in the database knows about if the client dies in between, and
 * nothing would ever delete it.
 */
export async function requestVideoUpload(
  db: Database,
  storage: Storage,
  userId: string,
  setId: string,
  input: RequestVideoUpload,
): Promise<VideoUploadTarget> {
  await ownedSet(db, userId, setId);
  await requireVideoConsent(db, userId);

  /*
   * Checked before a row is written, so a misconfigured bucket does not leave
   * a trail of analyses that can never receive a video.
   *
   * CONFLICT rather than SERVICE_UNAVAILABLE, and the distinction matters:
   * SERVICE_UNAVAILABLE is in RETRYABLE_ERROR_CODES, so the client would retry
   * this forever against a deployment where storage is simply not set up. A
   * missing bucket is a state of the server, not a blip.
   */
  if (!storage.configured) {
    throw conflict('Video analysis is not available on this deployment yet');
  }

  const analysisId = newId();
  const key = keys.cvVideo(userId, analysisId);

  const target = await storage.signUpload({
    key,
    contentType: input.contentType,
    contentLength: input.contentLength,
    ttlSecs: UPLOAD_TTL_SECS,
  });
  // A presign that fails on a CONFIGURED bucket is transient — a network blip
  // or a throttled key — so this one is genuinely worth retrying.
  if (!target) throw serviceUnavailable();

  /*
   * The span the worker will decode, derived here rather than taken from the
   * client. `clipWindow` clamps: a start past the end of the video becomes the
   * last window, and the length is always the domain's ceiling or the whole
   * video, whichever is shorter. So there is no request that can ask for more
   * than MAX_CLIP_SECONDS of analysis, however the client is written.
   */
  const window = clipWindow(input.durationSecs, input.clipStartSecs ?? 0);

  await db.insert(cvAnalyses).values({
    id: analysisId,
    userId,
    workoutSetId: setId,
    videoR2Key: key,
    status: 'awaiting_upload',
    clipStartSecs: window.startSecs,
    clipEndSecs: window.endSecs,
  });

  return {
    analysisId,
    uploadUrl: target.url,
    requiredHeaders: target.requiredHeaders,
    expiresAt: target.expiresAt.toISOString(),
  };
}

/**
 * The client confirming the PUT succeeded, which is what queues the work.
 *
 * Trusting the client here is deliberate and safe: the alternative is polling
 * R2 for the object, and the worst a lying client achieves is queueing work on
 * an object that is not there — which fails, once, in its own row.
 *
 * Idempotent. A retried confirmation on an already-queued analysis is a
 * success, because the client cannot tell whether its first attempt landed.
 */
export async function confirmVideoUpload(
  db: Database,
  userId: string,
  analysisId: string,
): Promise<Analysis> {
  const existing = await ownedAnalysis(db, userId, analysisId);

  if (existing.status === 'awaiting_upload') {
    await db.update(cvAnalyses).set({ status: 'queued' }).where(eq(cvAnalyses.id, analysisId));
  } else if (existing.status === 'failed') {
    // Re-queueing a failure needs a fresh upload, not a nudge.
    throw conflict('That analysis failed. Record the set again.');
  }

  return getAnalysis(db, null, userId, analysisId);
}

async function ownedAnalysis(
  db: Database,
  userId: string,
  analysisId: string,
): Promise<typeof cvAnalyses.$inferSelect> {
  const [row] = await db
    .select()
    .from(cvAnalyses)
    .where(and(eq(cvAnalyses.id, analysisId), eq(cvAnalyses.userId, userId)))
    .limit(1);

  if (!row) throw notFound('That analysis could not be found');
  return row;
}

/** One analysis, with a playback URL when there is something to play. */
export async function getAnalysis(
  db: Database,
  storage: Storage | null,
  userId: string,
  analysisId: string,
): Promise<Analysis> {
  const row = await ownedAnalysis(db, userId, analysisId);
  return toWire(row, storage);
}

/** Every analysis for a set, newest first. */
export async function listSetAnalyses(
  db: Database,
  storage: Storage,
  userId: string,
  setId: string,
): Promise<{ items: Analysis[] }> {
  await ownedSet(db, userId, setId);

  const rows = await db
    .select()
    .from(cvAnalyses)
    .where(and(eq(cvAnalyses.userId, userId), eq(cvAnalyses.workoutSetId, setId)))
    .orderBy(desc(cvAnalyses.createdAt));

  return { items: await Promise.all(rows.map((row) => toWire(row, storage))) };
}

/**
 * Deletes an analysis and its video.
 *
 * The object is removed before the row, so a failure leaves a row pointing at
 * a missing object — which reads as a broken video — rather than an object no
 * row references, which nothing would ever find again.
 */
export async function deleteAnalysis(
  db: Database,
  storage: Storage,
  userId: string,
  analysisId: string,
): Promise<void> {
  const row = await ownedAnalysis(db, userId, analysisId);

  if (storage.configured) {
    // Best effort: a bucket that refuses the delete must not strand the row.
    await storage.deleteObject(row.videoR2Key).catch(() => undefined);
  }
  await db.delete(cvAnalyses).where(eq(cvAnalyses.id, analysisId));
}

async function toWire(
  row: typeof cvAnalyses.$inferSelect,
  storage: Storage | null,
): Promise<Analysis> {
  /*
   * No playback URL until the video is actually there. Presigning a key that
   * has not been written yields a URL that 404s, which looks like a broken
   * player rather than an upload still in progress.
   */
  const playable = row.status !== 'awaiting_upload';
  const videoUrl =
    playable && storage?.configured
      ? await storage.signDownload(row.videoR2Key, PLAYBACK_TTL_SECS)
      : null;

  return {
    id: row.id,
    workoutSetId: row.workoutSetId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    repCount: row.repCount,
    clipStartSecs: row.clipStartSecs,
    clipEndSecs: row.clipEndSecs,
    // Written by the worker; trusted to match the schema it was given.
    result: (row.result as Analysis['result']) ?? null,
    error: row.error,
    videoUrl,
  };
}

/**
 * Refuses to issue an upload target without recorded consent (FR-VID-01).
 *
 * This function is the privacy policy's claim — "it stays off until you agree
 * to it in the app" — expressed as code. Without it that sentence is a promise
 * with nothing behind it, and a client could upload video from an account that
 * never agreed to being recorded.
 *
 * FORBIDDEN, not NOT_FOUND. The usual rule in this API is 404 so an id cannot
 * be probed, but there is no id here to protect: the caller is asking about
 * their OWN account, already knows it exists, and needs to be told the reason
 * so the app can show the consent screen rather than an unexplained failure.
 */
async function requireVideoConsent(db: Database, userId: string): Promise<void> {
  const [profile] = await db
    .select({ consentedAt: userProfiles.videoConsentAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile?.consentedAt) {
    throw forbidden('Turn on form analysis before recording a set');
  }
}
