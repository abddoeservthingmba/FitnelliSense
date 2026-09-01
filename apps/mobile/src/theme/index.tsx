/**
 * Theme access. NFR-U-06: dark mode follows the system preference.
 *
 * Styles are built through `useStyles`, which memoises a factory against the
 * active theme — so a component never carries a hard-coded colour and never
 * rebuilds its stylesheet on every render.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import {
  fontSize,
  fontWeight,
  palettes,
  radius,
  space,
  tracking,
  duration,
  HIT_SLOP,
  type ColorScheme,
  type ThemeColors,
} from './tokens';

/** NFR-U-01: single column at or below 600, two columns from 900. */
export type Layout = 'compact' | 'medium' | 'wide';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  tracking: typeof tracking;
  duration: typeof duration;
  hitSlop: number;
  layout: Layout;
  /** True from the two-column breakpoint up. */
  isWide: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

function layoutFor(width: number): Layout {
  if (width >= 900) return 'wide';
  if (width > 600) return 'medium';
  return 'compact';
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const scheme: ColorScheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const { width } = useWindowDimensions();

  const theme = useMemo<Theme>(() => {
    const layout = layoutFor(width);
    return {
      scheme,
      colors: palettes[scheme],
      space,
      radius,
      fontSize,
      fontWeight,
      tracking,
      duration,
      hitSlop: HIT_SLOP,
      layout,
      isWide: layout === 'wide',
    };
  }, [scheme, width]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}

/**
 * Builds a stylesheet from the theme, memoised per scheme and breakpoint.
 *
 * ```ts
 * const styles = useStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 * ```
 */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
}

export { palettes } from './tokens';
export type { ThemeColors } from './tokens';
