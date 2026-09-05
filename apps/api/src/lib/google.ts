/**
 * Verifying a Google ID token.
 *
 * THIS FILE IS A SECURITY BOUNDARY. Everything downstream trusts the identity
 * it returns, so every check that makes the token meaningful happens here and
 * nowhere else.
 *
 * An ID token is a JWT signed by Google. Verifying it means five things, and
 * skipping any one of them makes the whole exercise decorative:
 *
 *   1. SIGNATURE, against Google's published keys. Without it the token is a
 *      base64 string anyone can type.
 *   2. ISSUER, so a token signed by some other provider cannot be presented.
 *   3. AUDIENCE, so a token Google minted for a DIFFERENT application cannot be
 *      replayed at ours. This is the check people most often omit: any app can
 *      obtain a valid, correctly-signed Google token for its own client id, and
 *      without an audience check that token would sign its holder in here as
 *      whoever it names.
 *   4. EXPIRY, handled by jose.
 *   5. EMAIL_VERIFIED, which is this application's own rule rather than a JWT
 *      one. A Google account can carry an unverified address; treating that as
 *      proof of the address would make the whole account-linking design unsound.
 *
 * No secret is involved. Verification uses Google's PUBLIC keys, which is why
 * only a client id is configured and no client secret exists anywhere in this
 * codebase — the app is a public client and could not keep one.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Where Google publishes the public keys its ID tokens are signed with. */
const JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/** Both spellings are legitimate and Google uses each in different places. */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdentity {
  /** Stable, never reassigned. The real identity key. */
  readonly sub: string;
  readonly email: string;
  readonly name: string | null;
}

/**
 * Why a token was rejected. The caller turns every one of these into the same
 * opaque failure for the client — the distinction is for our logs.
 */
export type GoogleFailure =
  | 'not_configured'
  | 'invalid_token'
  | 'email_missing'
  | 'email_unverified';

export class GoogleAuthError extends Error {
  constructor(readonly reason: GoogleFailure) {
    super(`Google sign-in failed: ${reason}`);
    this.name = 'GoogleAuthError';
  }
}

/**
 * Injectable so the service can be tested without the network, and so a test
 * cannot accidentally pass by talking to Google.
 */
export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
  readonly isConfigured: boolean;
}

/** Refuses everything, for a deployment with no client id set. */
export const disabledGoogleVerifier: GoogleVerifier = {
  isConfigured: false,
  verify: () => Promise.reject(new GoogleAuthError('not_configured')),
};

/**
 * The JWKS is fetched once and cached by jose, which also handles key rotation
 * by refetching when it sees an unknown key id. Created at module scope so the
 * cache is shared rather than rebuilt per request.
 */
const remoteKeys = createRemoteJWKSet(JWKS_URL);

/**
 * @param audiences Every client id that may appear in `aud`. Android and web
 *   are separate OAuth clients with separate ids, and both are legitimate.
 */
export function createGoogleVerifier(audiences: readonly string[]): GoogleVerifier {
  if (audiences.length === 0) return disabledGoogleVerifier;

  return {
    isConfigured: true,
    async verify(idToken: string): Promise<GoogleIdentity> {
      let payload;
      try {
        // Signature, issuer, audience and expiry, all of them, in one call.
        ({ payload } = await jwtVerify(idToken, remoteKeys, {
          issuer: ISSUERS,
          audience: [...audiences],
        }));
      } catch {
        // Deliberately swallowed: jose's message describes which claim failed,
        // which is a map of our checks and belongs in neither a log nor a
        // response.
        throw new GoogleAuthError('invalid_token');
      }

      const email = typeof payload.email === 'string' ? payload.email : null;
      if (email === null) throw new GoogleAuthError('email_missing');

      /*
       * The application's own rule, and the one the whole linking design rests
       * on. `email_verified` can be the boolean true or the string "true"
       * depending on the flow the token came from, so both are accepted — and
       * nothing else is.
       */
      const verified = payload.email_verified;
      if (verified !== true && verified !== 'true') {
        throw new GoogleAuthError('email_unverified');
      }

      return {
        sub: String(payload.sub),
        email,
        name: typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name : null,
      };
    },
  };
}
