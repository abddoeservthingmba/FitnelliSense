/**
 * Sign in with Google, in a browser (FR-AUTH-11).
 *
 * A `.web.tsx` sibling, so Metro picks this on web and the native file on
 * Android. That is better than a `Platform.OS` branch here: the native SDK is
 * a native module that has no business being reachable from a web bundle at
 * all, and the previous attempt at a branch simply returned null — leaving web
 * with no Google sign-in while the file's own docstring claimed otherwise.
 *
 * WHY GOOGLE IDENTITY SERVICES rather than the native SDK or an OAuth
 * redirect. There is no Play Services in a browser. GIS is Google's supported
 * web path, it returns an ID TOKEN directly — the same credential the Android
 * flow produces and the only one our server can verify — and it needs no
 * redirect URI, so the custom-scheme rejection that killed the first Android
 * attempt cannot apply here.
 *
 * The button is GOOGLE'S OWN, rendered by their script into a container. Not a
 * styling concession: their branding terms require the real mark and wording,
 * and a hand-built lookalike is both a licence problem and a phishing pattern
 * users are right to distrust.
 *
 * THIS NEEDS THE ORIGIN AUTHORISED. Google refuses an unlisted origin outright,
 * so every origin the app is served from — the Netlify domain in production,
 * http://localhost:8081 for local development — must be listed as an
 * Authorised JavaScript origin on the WEB OAuth client. There is no way to
 * discover that from here; it fails at run time with `origin_mismatch`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import { Text } from '../../components/Text';
import { Stack as Column } from '../../components/Card';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface CredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/**
 * Loads Google's script once per page.
 *
 * Module-level rather than per-component: two mounts would otherwise insert
 * two script tags, and GIS is not built to be initialised twice.
 */
let loader: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    // Almost always the CSP or an ad blocker. Reported rather than left as a
    // button that silently never appears.
    script.onerror = () => reject(new Error('Google sign-in could not be loaded'));
    document.head.appendChild(script);
  });

  return loader;
}

interface GoogleSignInButtonProps {
  onToken: (idToken: string) => void;
  loading?: boolean;
  error?: string | null;
}

export function GoogleSignInButton({ onToken, loading, error }: GoogleSignInButtonProps) {
  const extra = Constants.expoConfig?.extra ?? {};
  const webClientId = typeof extra.googleWebClientId === 'string' ? extra.googleWebClientId : '';

  const container = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * The callback in a ref, so re-rendering the parent does not re-initialise
   * GIS and stack up buttons. `onToken` is recreated on most renders and would
   * otherwise be a dependency that changes constantly.
   */
  const latest = useRef(onToken);
  latest.current = onToken;

  const handle = useCallback((response: CredentialResponse) => {
    // `credential` IS the ID token — a signed JWT. Forwarded untouched; the
    // server verifies it and reads the identity out of it.
    if (response.credential) latest.current(response.credential);
    else setFailure('Google did not return a sign-in token. Try again.');
  }, []);

  useEffect(() => {
    if (!webClientId) return;
    let cancelled = false;

    void loadGsi()
      .then(() => {
        if (cancelled || !container.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: webClientId,
          callback: handle,
          // No One Tap. It appears unbidden on page load, and a sign-in
          // prompt nobody asked for is the kind of thing people click away
          // reflexively and then cannot find again.
          auto_select: false,
        });
        window.google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: 320,
        });
      })
      .catch((caught: Error) => {
        if (!cancelled) setFailure(caught.message);
      });

    return () => {
      cancelled = true;
    };
  }, [webClientId, handle]);

  if (!webClientId) return null;

  return (
    <Column gap="sm">
      <View style={{ alignItems: 'center', opacity: loading ? 0.5 : 1 }}>
        <div ref={container} />
      </View>
      {failure ?? error ? (
        <Text variant="caption" tone="warning">
          {failure ?? error}
        </Text>
      ) : null}
    </Column>
  );
}
