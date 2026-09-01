/**
 * Authentication logic (FR-AUTH-01..06).
 *
 * Kept out of the route handlers so the rules — rotation, revocation, uniform
 * failure messages — are readable in one place and testable without HTTP.
 */
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { TokenPair } from '@fi/shared';
import { emailCodes, refreshTokens, userProfiles, users } from '../db/schema';
import { conflict, unauthenticated } from '../lib/errors';
import { newId } from '../lib/ids';
import { generateCode, hashCode, MAX_ATTEMPTS } from '../lib/otp';
import { hashPassword, verifyPassword } from '../lib/passwords';
import {
  hashRefreshToken,
  hashesMatch,
  issueRefreshToken,
  signAccessToken,
  type TokenConfig,
} from '../lib/tokens';
import type { Database } from '../db/client';

export interface AuthDeps {
  readonly db: Database;
  readonly tokens: TokenConfig;
  readonly otpTtlSecs: number;
}

export interface AuthResult {
  readonly userId: string;
  readonly tokens: TokenPair;
}

/**
 * Login and password-reset failures all read the same way. Telling a caller
 * that an email exists is an account-enumeration gift.
 */
const SIGN_IN_FAILED = 'That email and password do not match';

async function issuePair(
  deps: AuthDeps,
  user: { id: string; isAdmin: boolean },
): Promise<TokenPair> {
  const access = await signAccessToken(deps.tokens, { userId: user.id, isAdmin: user.isAdmin });
  const refresh = issueRefreshToken(deps.tokens);

  await deps.db.insert(refreshTokens).values({
    id: newId(),
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt,
  });

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
  };
}

export async function register(
  deps: AuthDeps,
  input: { email: string; password: string; displayName: string },
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  const userId = newId();

  const created = await deps.db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing.length > 0) throw conflict('An account already exists for that email');

    const [user] = await tx
      .insert(users)
      .values({ id: userId, email: input.email, passwordHash })
      .returning({ id: users.id, isAdmin: users.isAdmin });
    if (!user) throw conflict('That account could not be created');

    await tx.insert(userProfiles).values({ userId: user.id, displayName: input.displayName });
    return user;
  });

  return { userId: created.id, tokens: await issuePair(deps, created) };
}

export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const [user] = await deps.db
    .select({
      id: users.id,
      isAdmin: users.isAdmin,
      passwordHash: users.passwordHash,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Hash a dummy password when the account is absent, so a missing account and
  // a wrong password take the same time to answer.
  const storedHash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$0000000000000000$0000';
  const passwordOk = await verifyPassword(storedHash, input.password);

  if (!user || user.deletedAt !== null || !passwordOk) throw unauthenticated(SIGN_IN_FAILED);

  return { userId: user.id, tokens: await issuePair(deps, user) };
}

/**
 * FR-AUTH-04: presenting a refresh token consumes it. Reuse of an already
 * rotated token revokes the whole family, because reuse means the token leaked.
 */
export async function refresh(deps: AuthDeps, token: string): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(deps.tokens, token);

  const [stored] = await deps.db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      expiresAt: refreshTokens.expiresAt,
      revokedAt: refreshTokens.revokedAt,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored) throw unauthenticated('Please sign in again');

  if (stored.revokedAt !== null) {
    await revokeAllForUser(deps, stored.userId);
    throw unauthenticated('Please sign in again');
  }
  if (stored.expiresAt.getTime() <= Date.now()) throw unauthenticated('Please sign in again');

  const [user] = await deps.db
    .select({ id: users.id, isAdmin: users.isAdmin, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);
  if (!user || user.deletedAt !== null) throw unauthenticated('Please sign in again');

  await deps.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, stored.id));

  return { userId: user.id, tokens: await issuePair(deps, user) };
}

/** FR-AUTH-05. Logging out with an unknown token is a no-op, not an error. */
export async function logout(deps: AuthDeps, token: string): Promise<void> {
  await deps.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashRefreshToken(deps.tokens, token)),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

export async function revokeAllForUser(deps: AuthDeps, userId: string): Promise<void> {
  await deps.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

// ------------------------------------------------------------ one-time codes --

type CodePurpose = 'verify_email' | 'password_reset';

/**
 * Issues a code, retiring any live one for the same purpose.
 *
 * Retiring the old code is what makes "resend" safe: the partial unique index
 * on (user_id, purpose) WHERE used_at IS NULL means two live codes cannot
 * coexist, so a user cannot be left holding a code the server has forgotten.
 */
async function issueCode(
  deps: AuthDeps,
  userId: string,
  purpose: CodePurpose,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + deps.otpTtlSecs * 1000);

  await deps.db.transaction(async (tx) => {
    await tx
      .update(emailCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailCodes.userId, userId),
          eq(emailCodes.purpose, purpose),
          isNull(emailCodes.usedAt),
        ),
      );
    await tx.insert(emailCodes).values({
      id: newId(),
      userId,
      purpose,
      codeHash: hashCode(deps.tokens, code),
      expiresAt,
    });
  });

  return { code, expiresAt };
}

/** The one message every wrong, stale, exhausted or absent code produces. */
const CODE_REJECTED = 'That code is not valid or has expired';

/**
 * Spends a code, or throws.
 *
 * A wrong guess costs an attempt. Reaching MAX_ATTEMPTS marks the code used
 * rather than merely refusing it, so a burned code cannot be ground down
 * further by simply asking again.
 */
async function consumeCode(
  deps: AuthDeps,
  userId: string,
  purpose: CodePurpose,
  code: string,
): Promise<void> {
  const now = new Date();

  const [live] = await deps.db
    .select({ id: emailCodes.id, codeHash: emailCodes.codeHash, attempts: emailCodes.attempts })
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.userId, userId),
        eq(emailCodes.purpose, purpose),
        isNull(emailCodes.usedAt),
        gt(emailCodes.expiresAt, now),
      ),
    )
    .limit(1);

  if (!live) throw unauthenticated(CODE_REJECTED);

  // Constant-time, like every other credential comparison here. The search
  // space is only 10^6, so a timing signal would be worth more than usual.
  if (!hashesMatch(live.codeHash, hashCode(deps.tokens, code))) {
    const attempts = live.attempts + 1;
    await deps.db
      .update(emailCodes)
      .set({ attempts, usedAt: attempts >= MAX_ATTEMPTS ? now : null })
      .where(eq(emailCodes.id, live.id));
    throw unauthenticated(CODE_REJECTED);
  }

  // Conditional on it still being unused, so two simultaneous submissions of
  // the same correct code cannot both succeed.
  const spent = await deps.db
    .update(emailCodes)
    .set({ usedAt: now })
    .where(and(eq(emailCodes.id, live.id), isNull(emailCodes.usedAt)))
    .returning({ id: emailCodes.id });

  if (spent.length === 0) throw unauthenticated(CODE_REJECTED);
}

/**
 * Starts a password reset. Returns null for an unknown or deleted address, and
 * the caller answers 202 either way — the response must not reveal whether an
 * address is registered.
 */
export async function createPasswordReset(
  deps: AuthDeps,
  email: string,
): Promise<{ code: string; userId: string; expiresAt: Date } | null> {
  const [user] = await deps.db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.deletedAt !== null) return null;

  const issued = await issueCode(deps, user.id, 'password_reset');
  return { ...issued, userId: user.id };
}

/** Issues a verification code for an already-authenticated user. */
export async function createEmailVerification(
  deps: AuthDeps,
  userId: string,
): Promise<{ code: string; email: string; expiresAt: Date } | null> {
  const [user] = await deps.db
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  // Already verified is not an error — it is the desired state. Null tells the
  // route to report success without sending a second code.
  if (!user || user.emailVerified) return null;

  const issued = await issueCode(deps, userId, 'verify_email');
  return { ...issued, email: user.email };
}

export async function confirmEmailVerification(
  deps: AuthDeps,
  userId: string,
  code: string,
): Promise<void> {
  await consumeCode(deps, userId, 'verify_email', code);
  await deps.db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function verificationStatus(
  deps: AuthDeps,
  userId: string,
): Promise<{ email: string; emailVerified: boolean }> {
  const [user] = await deps.db
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw unauthenticated();
  return user;
}

export async function confirmPasswordReset(
  deps: AuthDeps,
  input: { email: string; code: string; password: string },
): Promise<void> {
  const [user] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
    .limit(1);

  // An unknown address is rejected with the same message as a wrong code, so
  // this endpoint cannot be used to test whether an address is registered.
  if (!user) throw unauthenticated(CODE_REJECTED);

  await consumeCode(deps, user.id, 'password_reset', input.code);

  const passwordHash = await hashPassword(input.password);
  await deps.db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // A password change invalidates every existing session.
  await revokeAllForUser(deps, user.id);
}
