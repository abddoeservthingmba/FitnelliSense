/**
 * Session state for the whole app.
 *
 * Holds the tokens, restores them at launch, and wires the HTTP client's
 * refresh hook. Refreshes are single-flight: several screens hitting a stale
 * token at once produce one refresh, not five (and five would revoke each
 * other under rotation — FR-AUTH-04).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { routes, type AuthResponse, type TokenPair } from '@fi/shared';
import { api, configureClient, type Session } from '../api/client';
import { clearSession, loadSession, saveSession } from './token-store';

export type AuthStatus = 'restoring' | 'signedIn' | 'signedOut';

interface AuthValue {
  status: AuthStatus;
  userId: string | null;
  signIn(input: { email: string; password: string }): Promise<void>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [userId, setUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // A ref, not state: the HTTP client reads this synchronously on every call.
  const sessionRef = useRef<Session | null>(null);
  const refreshInFlight = useRef<Promise<Session | null> | null>(null);

  const applySession = useCallback(async (tokens: TokenPair | null) => {
    sessionRef.current = tokens;
    if (tokens) {
      await saveSession(tokens);
      setStatus('signedIn');
    } else {
      await clearSession();
      setUserId(null);
      setStatus('signedOut');
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    const current = sessionRef.current;
    if (!current) return null;

    // Coalesce concurrent refreshes onto one request.
    refreshInFlight.current ??= (async () => {
      try {
        const tokens = await api.post<TokenPair>(
          routes.auth.refresh,
          { refreshToken: current.refreshToken },
          { anonymous: true },
        );
        sessionRef.current = tokens;
        await saveSession(tokens);
        return tokens;
      } catch {
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    return refreshInFlight.current;
  }, []);

  const signOutLocally = useCallback(() => {
    void applySession(null);
    queryClient.clear();
  }, [applySession, queryClient]);

  // Wire the client once, before any screen can issue a request.
  useEffect(() => {
    configureClient({
      getSession: () => sessionRef.current,
      refreshSession,
      onAuthLost: signOutLocally,
    });
  }, [refreshSession, signOutLocally]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      sessionRef.current = stored;
      setStatus(stored ? 'signedIn' : 'signedOut');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(
    async (path: string, body: unknown) => {
      const result = await api.post<AuthResponse>(path, body, { anonymous: true });
      setUserId(result.userId);
      await applySession(result.tokens);
      await queryClient.invalidateQueries();
    },
    [applySession, queryClient],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      userId,
      signIn: (input) => authenticate(routes.auth.login, input),
      signUp: (input) => authenticate(routes.auth.register, input),
      signOut: async () => {
        const refreshToken = sessionRef.current?.refreshToken;
        if (refreshToken) {
          // Best effort: a failed sign-out must still sign the user out locally.
          await api.post(routes.auth.logout, { refreshToken }).catch(() => undefined);
        }
        signOutLocally();
      },
    }),
    [authenticate, signOutLocally, status, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
