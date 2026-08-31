/**
 * Token minting and verification (FR-AUTH-03..05, NFR-S-02).
 *
 * Access tokens are short-lived signed JWTs. Refresh tokens are opaque random
 * strings — never JWTs — stored only as a peppered hash, so a database leak
 * does not hand over usable sessions.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { accessTokenClaimsSchema, type AccessTokenClaims } from '@fi/shared';
import { unauthenticated } from './errors';

const ISSUER = 'fitness-intellisense';
const AUDIENCE = 'fi-client';

export interface TokenConfig {
  readonly accessSecret: string;
  readonly refreshPepper: string;
  readonly accessTtlSecs: number;
  readonly refreshTtlSecs: number;
}

export interface IssuedRefreshToken {
  /** Returned to the client once and never stored in plain form. */
  readonly token: string;
  readonly hash: string;
  readonly expiresAt: Date;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  config: TokenConfig,
  input: { userId: string; isAdmin: boolean },
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + config.accessTtlSecs;

  const token = await new SignJWT({ isAdmin: input.isAdmin })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(secretKey(config.accessSecret));

  return { token, expiresAt: new Date(expiresAt * 1000) };
}

export async function verifyAccessToken(
  config: TokenConfig,
  token: string,
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config.accessSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const claims = accessTokenClaimsSchema.safeParse(payload);
    if (!claims.success) throw unauthenticated('That session is not valid');
    return claims.data;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw unauthenticated('Your session has expired');
    }
    if (error instanceof joseErrors.JOSEError) {
      throw unauthenticated('That session is not valid');
    }
    throw error;
  }
}

/** 256 bits of entropy, URL-safe, so the token survives any transport. */
export function issueRefreshToken(config: TokenConfig, now: Date = new Date()): IssuedRefreshToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashRefreshToken(config, token),
    expiresAt: new Date(now.getTime() + config.refreshTtlSecs * 1000),
  };
}

export function hashRefreshToken(config: TokenConfig, token: string): string {
  return createHmac('sha256', config.refreshPepper).update(token).digest('hex');
}

/** Constant-time comparison, so a lookup cannot be timed against a candidate. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Single-use tokens for password reset (FR-AUTH-06), same handling as refresh. */
export function issueSingleUseToken(
  config: TokenConfig,
  ttlSecs: number,
  now: Date = new Date(),
): IssuedRefreshToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashRefreshToken(config, token),
    expiresAt: new Date(now.getTime() + ttlSecs * 1000),
  };
}
