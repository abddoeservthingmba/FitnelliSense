/**
 * Sign in with Google (FR-AUTH-11).
 *
 * TWO IMPLEMENTATIONS, ONE BUTTON, and the split is forced rather than chosen.
 *
 * On Android this uses the NATIVE sign-in SDK. The first attempt used
 * `expo-auth-session`, which redirects through a browser back to a custom URI
 * scheme (`com.ascension.fitness:/oauthredirect`) — and Google refuses that for
 * Android clients created today:
 *
 *     Error 400: invalid_request
 *     Custom URI scheme is not enabled for your Android client.
 *
 * The native SDK does not redirect at all. It talks to Play Services, shows the
 * account chooser the user already knows, and hands back an ID token. No
 * browser, no scheme, and a better flow than the one that was blocked.
 *
 * On WEB there is no Play Services, so the browser keeps the redirect flow —
 * which is legitimate there, because a web origin is an https URL and not a
 * custom scheme.
 *
 * WHICH CLIENT ID: the native SDK is configured with the WEB client id, not the
 * Android one. That is not a mistake. The Android client is identified by the
 * package name and signing certificate rather than by an id in the code, and
 * the ID token it returns is minted for the *web* client — so `aud` is the web
 * id, which is what the server must accept. Both are in `GOOGLE_CLIENT_IDS`
 * anyway, so either would verify, but this is why only one appears here.
 *
 * What crosses the wire is only ever the ID token. The app never sends an email
 * or a name, because it could claim anything for either; the server reads the
 * identity out of a token whose signature it has checked.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Constants from 'expo-constants';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { Stack as Column } from '../../components/Card';

type SignInResult = { idToken: string | null } | null;

/**
 * The official four-colour mark.
 *
 * Drawn rather than bundled as an image: it is four paths, it stays sharp at
 * any size, and Google's brand terms require the mark be used unmodified —
 * which is easier to guarantee from the actual path data than from a PNG
 * somebody might later "tidy up".
 */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

interface GoogleSignInButtonProps {
  onToken: (idToken: string) => void;
  loading?: boolean;
  /** Shown when the exchange with our own API failed, not Google's part. */
  error?: string | null;
}

export function GoogleSignInButton({ onToken, loading, error }: GoogleSignInButtonProps) {
  const extra = Constants.expoConfig?.extra ?? {};
  const webClientId = typeof extra.googleWebClientId === 'string' ? extra.googleWebClientId : '';

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * Configured once. `webClientId` is what determines the `aud` of the token
   * the SDK returns, which is the claim our server checks.
   */
  useEffect(() => {
    if (Platform.OS === 'web' || !webClientId) return;
    void (async () => {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId, offlineAccess: false });
    })();
  }, [webClientId]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

      // Fails fast with a readable message on a device without Play Services,
      // rather than throwing something opaque out of the sign-in call.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // A stale session from a previous attempt makes the chooser skip
      // silently and return the same account without asking.
      await GoogleSignin.signOut().catch(() => undefined);

      const result = (await GoogleSignin.signIn()) as unknown as {
        data?: SignInResult;
        idToken?: string | null;
      };

      // v13 wraps the payload in `data`; older versions return it flat. Both
      // shapes are read rather than pinning to one and breaking on an upgrade.
      const idToken = result.data?.idToken ?? result.idToken ?? null;

      if (typeof idToken === 'string' && idToken.length > 0) {
        onToken(idToken);
      } else {
        setFailure('Google did not return a sign-in token. Try again.');
      }
    } catch (caught) {
      const code = (caught as { code?: string }).code;
      // A cancelled chooser is not an error and must not look like one.
      if (code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501') return;
      setFailure('Google sign-in could not be completed. Use your password instead.');
    } finally {
      setBusy(false);
    }
  }, [onToken]);

  // No client id in this build: nothing to offer, and a button that always
  // fails would be worse than its absence.
  if (!webClientId) return null;

  // Web has no Play Services. Rather than ship a button that cannot work
  // there, the browser is told to use the password form.
  if (Platform.OS === 'web') return null;

  return (
    <Column gap="sm">
      <Button
        label="Sign in with Google"
        variant="secondary"
        onPress={() => void signIn()}
        disabled={busy || loading}
        loading={busy || loading}
        icon={<GoogleMark />}
        fullWidth
      />
      {failure ?? error ? (
        <Text variant="caption" tone="warning">
          {failure ?? error}
        </Text>
      ) : null}
    </Column>
  );
}
