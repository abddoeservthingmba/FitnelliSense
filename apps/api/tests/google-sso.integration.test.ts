/**
 * Google sign-in and account linking — FR-AUTH-11, NFR-S-03.
 *
 * The verifier is STUBBED throughout, and that is a deliberate property of
 * this suite rather than a convenience: a test must not be able to pass by
 * reaching Google, and must not be able to fail because Google is slow. What
 * is under test here is not "is the signature checked" — that is `jose`'s job
 * and is exercised separately — but what an identity MEANS for the accounts we
 * already hold, which is where the security decisions actually live.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { refreshTokens, users } from '../src/db/schema';
import { GoogleAuthError, type GoogleIdentity, type GoogleVerifier } from '../src/lib/google';
import { signInWithGoogle, type AuthDeps } from '../src/services/auth-service';
import {
  closeTestContext,
  createTestContext,
  describeIntegration,
  registerUser,
  truncateAll,
  type TestContext,
} from './helpers/harness';

/** Answers with whatever identity a test wants Google to have asserted. */
function stubVerifier(identity: GoogleIdentity): GoogleVerifier {
  return { isConfigured: true, verify: () => Promise.resolve(identity) };
}

/**
 * A FRESH identity per test.
 *
 * The alternative — one fixed identity and a truncate before each test — costs
 * a full-schema TRUNCATE per test against a database several thousand miles
 * away, which took this suite from seconds to fifteen minutes and exhausted
 * the connection pool. Isolation by unique key is the same guarantee for none
 * of the cost.
 */
function freshIdentity(): GoogleIdentity {
  const id = randomUUID();
  return { sub: `google-sub-${id}`, email: `lifter-${id}@example.test`, name: 'A Lifter' };
}

describeIntegration('google sign-in', () => {
  let ctx: TestContext;
  let IDENTITY: GoogleIdentity;

  const depsFor = (identity: GoogleIdentity): AuthDeps => ({
    db: ctx.database.db,
    tokens: ctx.app.ctx.tokens,
    otpTtlSecs: ctx.config.OTP_TTL,
    google: stubVerifier(identity),
  });

  const userRow = async (email: string) => {
    const [row] = await ctx.database.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await truncateAll(ctx.database);
  });

  beforeEach(() => {
    IDENTITY = freshIdentity();
  });

  afterAll(async () => {
    await closeTestContext(ctx);
  });

  // ------------------------------------------------------- a new account --

  it('creates an account, already verified and with no password', async () => {
    const result = await signInWithGoogle(depsFor(IDENTITY), 'token');

    const row = await userRow(IDENTITY.email);
    expect(row?.id).toBe(result.userId);
    expect(row?.emailVerified).toBe(true);
    expect(row?.googleSub).toBe(IDENTITY.sub);
    // Not an unusable placeholder hash — actually absent.
    expect(row?.passwordHash).toBeNull();
    expect(result.tokens.accessToken).toBeTruthy();
  });

  it('returns the same account on a second sign-in rather than a second account', async () => {
    const first = await signInWithGoogle(depsFor(IDENTITY), 'token');
    const second = await signInWithGoogle(depsFor(IDENTITY), 'token');
    expect(second.userId).toBe(first.userId);
  });

  it('follows the google sub, not the email, when the address changes', async () => {
    const first = await signInWithGoogle(depsFor(IDENTITY), 'token');

    // Same person, new Gmail address. Matching on email would strand them from
    // their own history and silently open a second account.
    const renamed = { ...IDENTITY, email: freshIdentity().email };
    const second = await signInWithGoogle(depsFor(renamed), 'token');

    expect(second.userId).toBe(first.userId);
  });

  // ------------------------------------------------------------ linking --

  it('links to an existing VERIFIED account and leaves its password working', async () => {
    const user = await registerUser(ctx.app, { email: IDENTITY.email });
    await ctx.database.db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id));

    const result = await signInWithGoogle(depsFor(IDENTITY), 'token');
    expect(result.userId).toBe(user.id);

    const row = await userRow(IDENTITY.email);
    expect(row?.googleSub).toBe(IDENTITY.sub);
    // Both parties proved the same address, so nothing is taken away.
    expect(row?.passwordHash).not.toBeNull();

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(200);
  });

  /*
   * THE ONE THAT MATTERS.
   *
   * Anyone can register any address here and set a password; without
   * verification nothing connects that registration to the person who owns the
   * mailbox. If Google's proof merely linked and signed in, whoever registered
   * first would keep a working password on an account the real owner now uses.
   */
  it('takes over an UNVERIFIED account and destroys the unproven password', async () => {
    const squatter = await registerUser(ctx.app, { email: IDENTITY.email });

    const before = await userRow(IDENTITY.email);
    expect(before?.emailVerified).toBe(false);
    expect(before?.passwordHash).not.toBeNull();

    const result = await signInWithGoogle(depsFor(IDENTITY), 'token');
    expect(result.userId).toBe(squatter.id);

    const after = await userRow(IDENTITY.email);
    expect(after?.emailVerified).toBe(true);
    expect(after?.googleSub).toBe(IDENTITY.sub);
    expect(after?.passwordHash).toBeNull();

    // The password no longer opens the account.
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: squatter.email, password: squatter.password },
    });
    expect(login.statusCode).toBe(401);
  });

  it('also kills the sessions that password already opened', async () => {
    const squatter = await registerUser(ctx.app, { email: IDENTITY.email });

    await signInWithGoogle(depsFor(IDENTITY), 'token');

    // A live refresh token is as good as the password until it is revoked.
    const refreshed = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: squatter.refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);

    const rows = await ctx.database.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, squatter.id));
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  // ----------------------------------------------------------- refusals --

  it('refuses when the email belongs to a different google account', async () => {
    await signInWithGoogle(depsFor(IDENTITY), 'token');

    // Same address, different Google `sub`. Not reachable through Google, so
    // it is a state that should not exist — and taking the account over would
    // be worse than refusing.
    const impostor = { ...IDENTITY, sub: freshIdentity().sub };
    await expect(signInWithGoogle(depsFor(impostor), 'token')).rejects.toThrow();
  });

  it('refuses a deleted account', async () => {
    const user = await registerUser(ctx.app, { email: IDENTITY.email });
    await ctx.database.db
      .update(users)
      .set({ deletedAt: new Date(), emailVerified: true })
      .where(eq(users.id, user.id));

    await expect(signInWithGoogle(depsFor(IDENTITY), 'token')).rejects.toThrow();
  });

  it('never reaches the database when the token is rejected', async () => {
    const rejecting: GoogleVerifier = {
      isConfigured: true,
      verify: () => Promise.reject(new GoogleAuthError('email_unverified')),
    };

    await expect(
      signInWithGoogle({ ...depsFor(IDENTITY), google: rejecting }, 'token'),
    ).rejects.toBeInstanceOf(GoogleAuthError);

    // No account was created for an identity that was never established.
    expect(await userRow(IDENTITY.email)).toBeUndefined();
  });

  // -------------------------------------------------------- over HTTP --

  it('reports Google sign-in as unavailable when no client id is configured', async () => {
    // The harness builds the app with the disabled verifier, which is what a
    // deployment with no GOOGLE_CLIENT_IDS has.
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { idToken: 'x'.repeat(40) },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('CONFLICT');
  });

  it('rejects a body without a token before any verification happens', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { idToken: 'short' },
    });
    expect(response.statusCode).toBe(400);
  });
});
