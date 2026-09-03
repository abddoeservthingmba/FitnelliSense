/**
 * Which Ascension the UI is dressed as, available before anything renders.
 *
 * The Ascension lives on the profile, which arrives over the network. If the theme
 * waited for that, every launch would paint the default palette and then
 * repaint — a visible colour flash on the slowest possible ascension (a cold Render
 * instance can take 30 seconds to answer).
 *
 * So the chosen Ascension is mirrored into device storage the moment it is picked,
 * read synchronously-ish at startup, and reconciled with the profile when it
 * turns up. The profile stays the source of truth — this is a cache, and the
 * only thing it can get wrong is a colour, briefly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ASCENSION, isAscensionId, type AscensionId } from '@fi/domain';

const KEY = 'arise.ascension';

interface PathContextValue {
  ascensionId: AscensionId;
  /** Sets it locally and mirrors it to storage. Persisting to the profile is
   *  the caller's job — this keeps the theme independent of the API layer. */
  setAscensionLocally: (next: AscensionId) => void;
  /** True until storage has been read, so a screen can hold its entrance. */
  ready: boolean;
}

const AscensionContext = createContext<PathContextValue>({
  ascensionId: DEFAULT_ASCENSION,
  setAscensionLocally: () => {},
  ready: true,
});

export function AscensionProvider({ children }: { children: ReactNode }): ReactNode {
  const [ascensionId, setPathId] = useState<AscensionId>(DEFAULT_ASCENSION);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored !== null && isAscensionId(stored)) setPathId(stored);
      })
      .catch(() => {
        // A missing cache is not an error: the default is a real answer.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAscensionLocally = useCallback((next: AscensionId) => {
    // State first so the palette turns over immediately; the write can lag.
    setPathId(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ ascensionId, setAscensionLocally, ready }),
    [ascensionId, setAscensionLocally, ready],
  );
  return <AscensionContext.Provider value={value}>{children}</AscensionContext.Provider>;
}

export function useAscensionContext(): PathContextValue {
  return useContext(AscensionContext);
}

/**
 * Adopts the Ascension from the profile once it arrives.
 *
 * The local mirror wins at startup so the palette is right on the first paint;
 * the profile wins once it is known, which is what makes the choice follow the
 * account to a second device rather than living on one phone.
 */
export function useAscensionSync(fromProfile: AscensionId | undefined): void {
  const { ascensionId, setAscensionLocally } = useAscensionContext();
  useEffect(() => {
    if (fromProfile !== undefined && fromProfile !== ascensionId) setAscensionLocally(fromProfile);
  }, [fromProfile, ascensionId, setAscensionLocally]);
}
