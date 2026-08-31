/**
 * Debounces a value. Used for search input, so a 500-row library is queried
 * once per pause in typing rather than once per keystroke (NFR-P-03).
 */
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
