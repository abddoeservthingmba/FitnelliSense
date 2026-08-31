/** FR-AUTH-01..05, NFR-S-03. */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  closeTestContext,
  createTestContext,
  describeIntegration,
  registerUser,
  truncateAll,
  type TestContext,
} from './helpers/harness.js';

describeIntegration('auth', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });
  beforeEach(async () => {
    await truncateAll(ctx.database);
  });

  it('registers an account and returns a token pair (FR-AUTH-01, FR-AUTH-03)', async () => {
    const user = await registerUser(ctx.app);
    expect(user.accessToken).toBeTruthy();
    expect(user.refreshToken).toBeTruthy();

    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: user.authHeader });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: user.email, profile: { units: 'metric' } });
  });

  it('never returns the password hash', async () => {
    const user = await registerUser(ctx.app);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: user.authHeader });
    expect(me.body).not.toContain('argon2');
    expect(me.body).not.toContain('passwordHash');
  });

  it('refuses a duplicate email, case-insensitively', async () => {
    const user = await registerUser(ctx.app);
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: user.email.toUpperCase(),
        password: 'another long enough password',
        displayName: 'Copy',
      },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('signs in and rejects a wrong password with the same message as a missing account', async () => {
    const user = await registerUser(ctx.app);

    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(ok.statusCode).toBe(200);

    const wrongPassword = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'not the right password' },
    });
    const unknownAccount = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.test', password: 'not the right password' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: unknownAccount.json().error.message }),
      }),
    );
  });

  it('rotates refresh tokens and revokes the family on reuse (FR-AUTH-04)', async () => {
    const user = await registerUser(ctx.app);

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json<{ refreshToken: string }>().refreshToken;
    expect(rotated).not.toBe(user.refreshToken);

    // Replaying the consumed token is treated as a leak.
    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const afterRevocation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: rotated },
    });
    expect(afterRevocation.statusCode).toBe(401);
  });

  it('logs out, invalidating that refresh token (FR-AUTH-05)', async () => {
    const user = await registerUser(ctx.app);

    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: user.authHeader,
      payload: { refreshToken: user.refreshToken },
    });
    expect(out.statusCode).toBe(200);

    const refresh = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('rejects an unauthenticated request and a malformed token', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/api/v1/me',
          headers: { authorization: 'Bearer not-a-jwt' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('validates the payload before touching the database (NFR-S-05)', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'short', displayName: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(response.json().error.details.length).toBeGreaterThan(0);
  });

  it('answers the same way whether or not a reset address is registered', async () => {
    const user = await registerUser(ctx.app);
    const known = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: user.email },
    });
    const unknown = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'nobody@example.test' },
    });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.body).toBe(unknown.body);
  });

  it('echoes a correlation id and generates one when absent (NFR-O-04)', async () => {
    const supplied = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'req-abcdef123456' },
    });
    expect(supplied.headers['x-request-id']).toBe('req-abcdef123456');

    const generated = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(generated.headers['x-request-id']).toBeTruthy();
  });

  it('reports the deployed commit on /health (NFR-D-05)', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'api', commit: 'local' });
  });
});
