/**
 * Which Path the UI is dressed as, available before anything renders.
 *
 * The Path lives on the profile, which arrives over the network. If the theme
 * waited for that, every launch would paint the default palette and then
 * repaint — a visible colour flash on the slowest possible path (a cold Render
 * instance can take 30 seconds to answer).
 *
 * So the chosen Path is mirrored into device storage the moment it is picked,
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
import { DEFAULT_PATH, isPathId, type PathId } from '@fi/domain';

const KEY = 'arise.path';

interface PathContextValue {
  pathId: PathId;
  /** Sets it locally and mirrors it to storage. Persisting to the profile is
   *  the caller's job — this keeps the theme independent of the API layer. */
  setPathLocally: (next: PathId) => void;
  /** True until storage has been read, so a screen can hold its entrance. */
  ready: boolean;
}

const PathContext = createContext<PathContextValue>({
  pathId: DEFAULT_PATH,
  setPathLocally: () => {},
  ready: true,
});

export function PathProvider({ children }: { children: ReactNode }): ReactNode {
  const [pathId, setPathId] = useState<PathId>(DEFAULT_PATH);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored !== null && isPathId(stored)) setPathId(stored);
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

  const setPathLocally = useCallback((next: PathId) => {
    // State first so the palette turns over immediately; the write can lag.
    setPathId(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ pathId, setPathLocally, ready }), [pathId, setPathLocally, ready]);
  return <PathContext.Provider value={value}>{children}</PathContext.Provider>;
}

export function usePathContext(): PathContextValue {
  return useContext(PathContext);
}

/**
 * Adopts the Path from the profile once it arrives.
 *
 * The local mirror wins at startup so the palette is right on the first paint;
 * the profile wins once it is known, which is what makes the choice follow the
 * account to a second device rather than living on one phone.
 */
export function usePathSync(fromProfile: PathId | undefined): void {
  const { pathId, setPathLocally } = usePathContext();
  useEffect(() => {
    if (fromProfile !== undefined && fromProfile !== pathId) setPathLocally(fromProfile);
  }, [fromProfile, pathId, setPathLocally]);
}
