/**
 * Form analysis — FR-VID-*, NFR-S-03.
 *
 * These suites run without R2 credentials, which is deliberate rather than a
 * limitation: the behaviour that matters most is what happens at the ownership
 * boundary, and that is identical whether or not a bucket exists. The tests
 * that need a real presign are named as skipped so their absence is visible
 * rather than assumed.
 *
 * A video is the most personal thing this app will hold — someone's face and
 * their gym — so an id that leaks whether another user's analysis exists is
 * worse here than anywhere else.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { ExerciseSummary } from '@fi/shared';
import {
  client,
  closeTestContext,
  createTestContext,
  describeIntegration,
  first,
  registerUser,
  seedCatalogue,
  truncateAll,
  type TestClient,
  type TestContext,
} from './helpers/harness';

const VALID_REQUEST = {
  contentLength: 6 * 1024 * 1024,
  contentType: 'video/mp4' as const,
  durationSecs: 30,
};

describeIntegration('form analysis', () => {
  let ctx: TestContext;
  let api: TestClient;
  let otherApi: TestClient;
  let setId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await truncateAll(ctx.database);
    await seedCatalogue(ctx);
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  beforeEach(async () => {
    api = client(ctx.app, await registerUser(ctx.app));
    otherApi = client(ctx.app, await registerUser(ctx.app));

    const list = await api.get('/api/v1/exercises?q=Barbell%20Bench%20Press&limit=1');
    const exerciseId = first(list.json<{ items: ExerciseSummary[] }>().items, 'exercise').id;

    const workoutId = randomUUID();
    await api.post('/api/v1/workouts', { id: workoutId, startedAt: '2026-09-04T09:00:00Z' });
    const weId = randomUUID();
    await api.post(`/api/v1/workouts/${workoutId}/exercises`, { id: weId, exerciseId });

    setId = randomUUID();
    await api.post(`/api/v1/workouts/${workoutId}/exercises/${weId}/sets`, {
      id: setId,
      weightKg: '100',
      reps: 5,
      isCompleted: true,
    });
  });

  // ------------------------------------------------------- the boundary --

  it('404s when asking to upload against another account’s set', async () => {
    // Not 403. A 403 confirms the set exists.
    const response = await otherApi.post(`/api/v1/sets/${setId}/video`, VALID_REQUEST);
    expect(response.statusCode).toBe(404);
  });

  it('404s when listing another account’s set', async () => {
    expect((await otherApi.get(`/api/v1/sets/${setId}/analyses`)).statusCode).toBe(404);
  });

  it('404s for a set id that is not a set at all', async () => {
    expect((await api.post(`/api/v1/sets/${randomUUID()}/video`, VALID_REQUEST)).statusCode).toBe(
      404,
    );
  });

  it('404s for an analysis id nobody owns', async () => {
    expect((await api.get(`/api/v1/analyses/${randomUUID()}`)).statusCode).toBe(404);
    expect((await api.del(`/api/v1/analyses/${randomUUID()}`)).statusCode).toBe(404);
    expect((await api.post(`/api/v1/analyses/${randomUUID()}/uploaded`)).statusCode).toBe(404);
  });

  it('requires a session for every route', async () => {
    const anonymous = client(ctx.app);
    expect((await anonymous.post(`/api/v1/sets/${setId}/video`, VALID_REQUEST)).statusCode).toBe(
      401,
    );
    expect((await anonymous.get(`/api/v1/sets/${setId}/analyses`)).statusCode).toBe(401);
    expect((await anonymous.get(`/api/v1/analyses/${randomUUID()}`)).statusCode).toBe(401);
  });

  it('rejects an id that is not a uuid', async () => {
    expect((await api.post('/api/v1/sets/not-a-uuid/video', VALID_REQUEST)).statusCode).toBe(400);
  });

  // ------------------------------------------------------- the contract --

  it('refuses a file too large to be one set', async () => {
    // Rejected by the schema, before a row or a presign — the point is to say
    // no before 80 MB crosses someone's mobile data.
    const response = await api.post(`/api/v1/sets/${setId}/video`, {
      ...VALID_REQUEST,
      contentLength: 200 * 1024 * 1024,
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a clip too long to be one set', async () => {
    const response = await api.post(`/api/v1/sets/${setId}/video`, {
      ...VALID_REQUEST,
      durationSecs: 600,
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses anything that is not mp4', async () => {
    // One container means one thing for the worker to decode.
    const response = await api.post(`/api/v1/sets/${setId}/video`, {
      ...VALID_REQUEST,
      contentType: 'video/quicktime',
    });
    expect(response.statusCode).toBe(400);
  });

  it('lists nothing for a set with no analyses, rather than 404ing', async () => {
    const response = await api.get(`/api/v1/sets/${setId}/analyses`);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: unknown[] }>().items).toEqual([]);
  });

  // -------------------------------------------------- storage behaviour --

  it('says the feature is unavailable rather than telling the client to retry', async () => {
    /*
     * Consent FIRST, or this never reaches the storage check — the gate runs
     * before it, and the test would pass on a 403 while claiming to be about
     * the bucket. It failed exactly that way when the gate was added, which
     * is the useful kind of failure.
     *
     * With no R2 credentials, `storage.configured` is false, and the answer
     * must be 409 and NOT 503: SERVICE_UNAVAILABLE is in
     * RETRYABLE_ERROR_CODES, so a 503 would have the client retrying forever
     * against a deployment where storage is simply not set up.
     *
     * If this starts failing with a 201, credentials have reached the test
     * environment — at which point the skipped test below is the one to write.
     */
    await api.post('/api/v1/me/video-consent');

    const response = await api.post(`/api/v1/sets/${setId}/video`, VALID_REQUEST);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('CONFLICT');
  });

  it('writes no row when storage is unavailable', async () => {
    // Consent first, for the same reason: without it this would be testing
    // the consent gate and passing for the wrong reason.
    await api.post('/api/v1/me/video-consent');

    // The storage check happens before the insert, so a misconfigured bucket
    // cannot leave a trail of analyses that can never receive a video.
    await api.post(`/api/v1/sets/${setId}/video`, VALID_REQUEST);
    const listed = await api.get(`/api/v1/sets/${setId}/analyses`);
    expect(listed.json<{ items: unknown[] }>().items).toEqual([]);
  });

  // -------------------------------------------------------- the consent --

  /*
   * The privacy policy states that video 'stays off until you agree to it in
   * the app'. These are the tests that make that a fact rather than a claim —
   * without them the sentence is a promise with nothing behind it.
   */
  it('refuses to issue an upload target without recorded consent', async () => {
    const response = await api.post(`/api/v1/sets/${setId}/video`, VALID_REQUEST);
    // 403 and not 404: the caller is asking about their own account, already
    // knows it exists, and needs the reason so the app can show the consent
    // screen rather than an unexplained failure.
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
  });

  it('records consent as a timestamp, not a flag', async () => {
    const granted = await api.post('/api/v1/me/video-consent');
    expect(granted.statusCode).toBe(200);
    const at = granted.json<{ profile: { videoConsentAt: string | null } }>().profile
      .videoConsentAt;
    expect(at).not.toBeNull();
    // A date, so it is possible to say WHICH wording someone agreed to.
    expect(Number.isFinite(Date.parse(at as string))).toBe(true);
  });

  it('starts every account with no consent', async () => {
    // Nobody is defaulted into being recorded — the failure that 0009's
    // leaderboard reconsent existed to correct.
    const me = await api.get('/api/v1/me');
    expect(
      me.json<{ profile: { videoConsentAt: string | null } }>().profile.videoConsentAt,
    ).toBeNull();
  });

  it('withdraws consent without deleting anything', async () => {
    await api.post('/api/v1/me/video-consent');
    const withdrawn = await api.del('/api/v1/me/video-consent');
    expect(withdrawn.statusCode).toBe(200);
    expect(
      withdrawn.json<{ profile: { videoConsentAt: string | null } }>().profile.videoConsentAt,
    ).toBeNull();

    // And the gate closes again immediately.
    expect((await api.post(`/api/v1/sets/${setId}/video`, VALID_REQUEST)).statusCode).toBe(403);
  });

  it('cannot be granted by PATCHing a timestamp', async () => {
    // The field is omitted from the update schema, so an attempt to set it is
    // an unknown key and rejected outright (NFR-S-05).
    const response = await api.patch('/api/v1/me', {
      videoConsentAt: '2020-01-01T00:00:00.000Z',
    });
    expect(response.statusCode).toBe(400);

    const me = await api.get('/api/v1/me');
    expect(
      me.json<{ profile: { videoConsentAt: string | null } }>().profile.videoConsentAt,
    ).toBeNull();
  });

  /*
   * NOT WRITTEN, and named so the gap is visible in the test output rather
   * than being something a reader has to notice is absent. These need real R2
   * credentials in the test environment:
   *
   *   - a presign returns a usable PUT url and the row lands as awaiting_upload
   *   - confirming the upload moves it to queued, and is idempotent
   *   - an analysis awaiting upload has no playback url
   *   - deleting removes the object as well as the row
   */
  it.skip('presigns, confirms and plays back (needs R2 credentials)', () => {});
});
