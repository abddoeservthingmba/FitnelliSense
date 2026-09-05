/**
 * Sign in with Google (FR-AUTH-11).
 *
 * WHAT CROSSES THE WIRE IS AN ID TOKEN, and nothing else. Google hands the app
 * a signed token; the app forwards it; the server checks the signature, the
 * issuer, the AUDIENCE and `email_verified` against Google's public keys and
 * reads the identity out of the token itself. The client never sends an email
 * or a name, because it could claim anything for either.
 *
 * There is no client secret anywhere. A mobile app is a public client — it
 * ships to strangers and cannot keep one — so the flow is the ID-token flow,
 * not the code exchange, and the security rests on the audience check.
 *
 * THE BUTTON HIDES ITSELF when no client id is configured. That is not
 * defensive dressing: a deployment without `GOOGLE_CLIENT_IDS` answers 409, and
 * a button that always fails is worse than no button. It is also why the ids
 * are read from Expo config rather than hard-coded — a build for a different
 * backend must not offer a sign-in that backend will refuse.
 */
import { useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { Stack as Column } from '../../components/Card';

/*
 * Required once, at module scope: it closes the in-app browser tab that the
 * OAuth redirect lands in. Without it the user is returned to the app with a
 * browser sheet still covering it.
 */
WebBrowser.maybeCompleteAuthSession();

interface GoogleSignInButtonProps {
  onToken: (idToken: string) => void;
  loading?: boolean;
  /** Shown when the exchange with our own API failed, not Google's part. */
  error?: string | null;
}

export function GoogleSignInButton({ onToken, loading, error }: GoogleSignInButtonProps) {
  const extra = Constants.expoConfig?.extra ?? {};
  const webClientId = typeof extra.googleWebClientId === 'string' ? extra.googleWebClientId : '';
  const androidClientId =
    typeof extra.googleAndroidClientId === 'string' ? extra.googleAndroidClientId : '';

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: webClientId,
    ...(androidClientId ? { androidClientId } : {}),
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    /*
     * `id_token`, not `access_token`. An access token is a key to Google's
     * APIs and proves nothing about who is holding it; an ID token is a signed
     * assertion of identity, which is the only one of the two our server can
     * verify without calling Google.
     */
    const idToken = response.params.id_token;
    if (typeof idToken === 'string' && idToken.length > 0) onToken(idToken);
  }, [response, onToken]);

  // No client id in this build: nothing to offer, and a button that always
  // fails would be worse than its absence.
  if (!webClientId) return null;

  return (
    <Column gap="sm">
      <Button
        label="Continue with Google"
        variant="secondary"
        onPress={() => void promptAsync()}
        // `request` is null until the request object has been prepared.
        disabled={!request || loading}
        loading={loading}
        fullWidth
      />
      {error ? (
        <Text variant="caption" tone="warning">
          {error}
        </Text>
      ) : null}
    </Column>
  );
}
