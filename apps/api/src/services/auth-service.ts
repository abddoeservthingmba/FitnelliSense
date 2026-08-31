/**
 * Authentication logic (FR-AUTH-01..06).
 *
 * Kept out of the route handlers so the rules — rotation, revocation, uniform
 * failure messages — are readable in one place and testable without HTTP.
 */
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { TokenPair } from '@fi/shared';
import { refreshTokens, passwordResetTokens, userProfiles, users } from '../db/schema';
import { conflict, unauthenticated } from '../lib/errors';
import { newId } from '../lib/ids';
import { hashPassword, verifyPassword } from '../lib/passwords';
import {
  hashRefreshToken,
  issueRefreshToken,
  issueSingleUseToken,
  signAccessToken,
  type TokenConfig,
} from '../lib/tokens';
import type { Database } from '../db/client';

export interface AuthDeps {
  readonly db: Database;
  readonly tokens: TokenConfig;
  readonly passwordResetTtlSecs: number;
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

async function issuePair(deps: AuthDeps, user: { id: string; isAdmin: boolean }): Promise<TokenPair> {
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
      and(eq(refreshTokens.tokenHash, hashRefreshToken(deps.tokens, token)), isNull(refreshTokens.revokedAt)),
    );
}

export async function revokeAllForUser(deps: AuthDeps, userId: string): Promise<void> {
  await deps.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/**
 * FR-AUTH-06. Returns the token for the caller to email, or null when the
 * address is unknown — the endpoint answers the same either way.
 */
export async function createPasswordReset(
  deps: AuthDeps,
  email: string,
): Promise<{ token: string; userId: string } | null> {
  const [user] = await deps.db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.deletedAt !== null) return null;

  const single = issueSingleUseToken(deps.tokens, deps.passwordResetTtlSecs);
  await deps.db.insert(passwordResetTokens).values({
    id: newId(),
    userId: user.id,
    tokenHash: single.hash,
    expiresAt: single.expiresAt,
  });

  return { token: single.token, userId: user.id };
}

export async function confirmPasswordReset(
  deps: AuthDeps,
  input: { token: string; password: string },
): Promise<void> {
  const tokenHash = hashRefreshToken(deps.tokens, input.token);
  const now = new Date();

  const [stored] = await deps.db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!stored) throw unauthenticated('That reset link is no longer valid');

  const passwordHash = await hashPassword(input.password);
  await deps.db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, stored.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, stored.id));
  });

  // A password change invalidates every existing session.
  await revokeAllForUser(deps, stored.userId);
}
