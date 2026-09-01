/**
 * Reports when an in-flight request has been going long enough that the user
 * deserves an explanation.
 *
 * The free hosting tier sleeps after a quarter-hour idle and takes 30–60
 * seconds to wake. Without this, the first sign-in after a break is an
 * unexplained spinner, and the honest reading of an unexplained spinner is
 * "this is broken".
 */
import { useEffect, useState } from 'react';
import { SLOW_REQUEST_HINT_MS } from '../api/config';

export function useSlowRequest(active: boolean, delayMs = SLOW_REQUEST_HINT_MS): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}

/** The one place this wording lives, so both auth screens say the same thing. */
export const WAKING_MESSAGE =
  'Waking the server. Free hosting sleeps when idle, so this first request can take up to a minute.';
