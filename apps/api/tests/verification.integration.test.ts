/**
 * Email verification and password reset by one-time code (FR-AUTH-06).
 *
 * The code is read out of the sent message rather than out of the database, so
 * these tests exercise the thing most likely to break: that the code which
 * reaches the email is the code the server will accept.
 *
 * The properties that matter are the ones a weak credential depends on — a
 * code is spent once, wrong guesses run out, a new code retires the old one,
 * and neither endpoint can be used to discover whether an address exists.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  closeTestContext,
  createTestContext,
  describeIntegration,
  registerUser,
  truncateAll,
  type TestContext,
  type TestUser,
} from './helpers/harness';

const NEW_PASSWORD = 'a-brand-new-passphrase';

describeIntegration('verification and reset by code', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });
  beforeEach(async () => {
    await truncateAll(ctx.database);
    ctx.mailbox.clear();
  });

  const requestVerification = (user: TestUser) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/request',
      headers: user.authHeader,
    });

  const confirmVerification = (user: TestUser, code: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/confirm',
      headers: user.authHeader,
      payload: { code },
    });

  const requestReset = (email: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email },
    });

  const confirmReset = (email: string, code: string, password = NEW_PASSWORD) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { email, code, password },
    });

  const signIn = (email: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

  // ------------------------------------------------------- verification --

  it('starts unverified and becomes verified with the emailed code', async () => {
    const user = await registerUser(ctx.app);

    const before = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: user.authHeader,
    });
    expect(before.json<{ emailVerified: boolean }>().emailVerified).toBe(false);

    const requested = await requestVerification(user);
    expect(requested.statusCode).toBe(202);
    expect(requested.json()).toMatchObject({ ok: true, deliveryConfigured: true });

    // One email, to the right address.
    expect(ctx.mailbox.sent).toHaveLength(1);
    expect(ctx.mailbox.sent[0]?.to).toBe(user.email);

    const code = ctx.mailbox.lastCode();
    expect(code).toMatch(/^\d{6}$/);

    const confirmed = await confirmVerification(user, code ?? '');
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ email: user.email, emailVerified: true });

    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: user.authHeader,
    });
    expect(after.json<{ emailVerified: boolean }>().emailVerified).toBe(true);
  });

  it('refuses to verify without a session', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email/request',
    });
    expect(response.statusCode).toBe(401);
    expect(ctx.mailbox.sent).toHaveLength(0);
  });

  it('spends a code once, so a replay cannot re-verify', async () => {
    const user = await registerUser(ctx.app);
    await requestVerification(user);
    const code = ctx.mailbox.lastCode() ?? '';

    expect((await confirmVerification(user, code)).statusCode).toBe(200);
    // The code is gone, not merely redundant.
    expect((await confirmVerification(user, code)).statusCode).toBe(401);
  });

  it('sends nothing more once the address is verified', async () => {
    const user = await registerUser(ctx.app);
    await requestVerification(user);
    await confirmVerification(user, ctx.mailbox.lastCode() ?? '');
    ctx.mailbox.clear();

    // Already verified is success, not an error — and not another email.
    const again = await requestVerification(user);
    expect(again.statusCode).toBe(202);
    expect(ctx.mailbox.sent).toHaveLength(0);
  });

  it('runs out of guesses rather than allowing a code to be searched', async () => {
    const user = await registerUser(ctx.app);
    await requestVerification(user);
    const real = ctx.mailbox.lastCode() ?? '';
    const wrong = real === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await confirmVerification(user, wrong)).statusCode).toBe(401);
    }

    // The code is burned, so even the correct one no longer works.
    expect((await confirmVerification(user, real)).statusCode).toBe(401);

    const status = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: user.authHeader,
    });
    expect(status.json<{ emailVerified: boolean }>().emailVerified).toBe(false);
  });

  it('retires the previous code when a new one is requested', async () => {
    const user = await registerUser(ctx.app);
    await requestVerification(user);
    const first = ctx.mailbox.lastCode() ?? '';

    await requestVerification(user);
    const second = ctx.mailbox.lastCode() ?? '';
    expect(second).not.toBe(first);

    // Only the newest code is live, so an old email cannot be used.
    expect((await confirmVerification(user, first)).statusCode).toBe(401);
    expect((await confirmVerification(user, second)).statusCode).toBe(200);
  });

  it('rejects a malformed code as a validation error, not an auth failure', async () => {
    const user = await registerUser(ctx.app);
    const response = await confirmVerification(user, '12345');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('accepts a code with the formatting an email paste brings along', async () => {
    const user = await registerUser(ctx.app);
    await requestVerification(user);
    const code = ctx.mailbox.lastCode() ?? '';
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

    expect((await confirmVerification(user, spaced)).statusCode).toBe(200);
  });

  // ------------------------------------------------------ password reset --

  it('resets a password with the emailed code and signs in with the new one', async () => {
    const user = await registerUser(ctx.app);

    const requested = await requestReset(user.email);
    expect(requested.statusCode).toBe(202);
    const code = ctx.mailbox.lastCode() ?? '';

    const confirmed = await confirmReset(user.email, code);
    expect(confirmed.statusCode).toBe(200);

    expect((await signIn(user.email, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await signIn(user.email, user.password)).statusCode).toBe(401);
  });

  it('revokes every existing session when the password changes', async () => {
    const user = await registerUser(ctx.app);
    await requestReset(user.email);
    await confirmReset(user.email, ctx.mailbox.lastCode() ?? '');

    // The refresh token from before the reset must be dead.
    const refreshed = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);
  });

  it('sends no email and leaks nothing for an unknown address', async () => {
    const response = await requestReset('nobody@example.test');
    expect(response.statusCode).toBe(202);
    expect(ctx.mailbox.sent).toHaveLength(0);
  });

  it('rejects an unknown address on confirm exactly as it rejects a wrong code', async () => {
    const user = await registerUser(ctx.app);
    await requestReset(user.email);
    const code = ctx.mailbox.lastCode() ?? '';

    const unknownAddress = await confirmReset('nobody@example.test', code);
    const wrongCode = await confirmReset(user.email, code === '000000' ? '111111' : '000000');

    expect(unknownAddress.statusCode).toBe(401);
    expect(wrongCode.statusCode).toBe(401);

    // Indistinguishable, so this endpoint cannot test whether an account
    // exists. Compared without `requestId`, which is per-request by design and
    // carries no information about the account.
    const shape = (response: { json: () => { error: { requestId?: string } } }) => {
      const { requestId: _ignored, ...error } = response.json().error;
      return error;
    };
    expect(shape(unknownAddress)).toEqual(shape(wrongCode));
  });

  it('will not accept another user’s code', async () => {
    const alice = await registerUser(ctx.app);
    const bob = await registerUser(ctx.app);

    await requestReset(alice.email);
    const aliceCode = ctx.mailbox.lastCode() ?? '';

    // The code is scoped to the account it was issued for.
    expect((await confirmReset(bob.email, aliceCode)).statusCode).toBe(401);
    expect((await signIn(bob.email, bob.password)).statusCode).toBe(200);
  });

  it('keeps verification and reset codes separate', async () => {
    const user = await registerUser(ctx.app);

    await requestVerification(user);
    const verifyCode = ctx.mailbox.lastCode() ?? '';
    await requestReset(user.email);
    const resetCode = ctx.mailbox.lastCode() ?? '';

    // Two live codes for two purposes, and neither works for the other.
    expect((await confirmReset(user.email, verifyCode)).statusCode).toBe(401);
    expect((await confirmVerification(user, resetCode)).statusCode).toBe(401);

    // And each still works for its own purpose.
    expect((await confirmVerification(user, verifyCode)).statusCode).toBe(200);
    expect((await confirmReset(user.email, resetCode)).statusCode).toBe(200);
  });

  it('still enforces the password rules on reset', async () => {
    const user = await registerUser(ctx.app);
    await requestReset(user.email);
    const code = ctx.mailbox.lastCode() ?? '';

    const tooShort = await confirmReset(user.email, code, 'short');
    expect(tooShort.statusCode).toBe(400);

    // And the code survives a rejected payload, so the user is not locked out
    // by their own typo — validation runs before the code is spent.
    expect((await confirmReset(user.email, code)).statusCode).toBe(200);
  });
});
