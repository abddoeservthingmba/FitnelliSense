/**
 * Elapsed workout time.
 *
 * Same rule as the rest timer (BRD §13.2): derived from the start timestamp on
 * every tick, never accumulated. An app that was backgrounded for twenty
 * minutes shows twenty minutes, on both platforms.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useElapsed(startedAt: string | null): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }

    const started = Date.parse(startedAt);
    const recompute = () => setSeconds(Math.max(0, Math.round((Date.now() - started) / 1000)));

    recompute();
    const interval = setInterval(recompute, 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recompute();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [startedAt]);

  return seconds;
}
