/**
 * Design tokens — editorial, high contrast.
 *
 * The look is a performance instrument rather than a lifestyle app: a near
 * black ground, numbers set very large because the numbers *are* the content,
 * uppercase tracked labels doing the work of chrome, and one accent used
 * sparingly enough that it still means something when it appears.
 *
 * Both schemes are complete and contrast-checked to WCAG 2.1 AA (NFR-U-04),
 * and every touch target still lands on at least 44 dp (NFR-U-03).
 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Editorial geometry is tighter than the rounded-card default: corners are
 * crisp, so the accent blocks read as blocks.
 */
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/** Minimum interactive size, in dp (NFR-U-03). */
export const HIT_SLOP = 44;

export const fontSize = {
  micro: 11,
  caption: 12,
  footnote: 13,
  body: 15,
  callout: 17,
  title: 21,
  heading: 28,
  display: 40,
  /** The headline number on a stat: weights, volume, the live timer. */
  metric: 46,
  /** For a single hero figure that owns the screen. */
  hero: 64,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

/**
 * Letter spacing. Large numerals get negative tracking so they read as one
 * shape; small uppercase labels get positive tracking so they stay legible.
 */
export const tracking = {
  tight: -1.2,
  snug: -0.4,
  normal: 0,
  wide: 0.8,
  wider: 1.6,
} as const;

export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

interface Palette {
  /** The ground. Near-black in dark, near-white in light. */
  background: string;
  /** Cards and raised surfaces. */
  surface: string;
  surfaceRaised: string;
  /** The inverse block — used for the one action that matters on a screen. */
  inverse: string;
  inverseText: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  /** Records and celebrations. Used rarely, so it lands. */
  highlight: string;
  overlay: string;
  /** Track behind a progress bar. */
  track: string;
}

const dark: Palette = {
  background: '#08090A',
  surface: '#101214',
  surfaceRaised: '#191C1F',
  inverse: '#F5F7F8',
  inverseText: '#08090A',
  border: '#1F2427',
  borderStrong: '#333A3F',
  text: '#F5F7F8',
  textMuted: '#9BA6AE',
  textFaint: '#646F77',
  accent: '#C8FF4D',
  accentText: '#0F1400',
  accentSoft: '#1D2610',
  danger: '#FF5C5C',
  dangerSoft: '#2A1315',
  warning: '#FFB020',
  success: '#4ADE80',
  highlight: '#C8FF4D',
  overlay: 'rgba(4, 5, 6, 0.82)',
  track: '#22282C',
};

const light: Palette = {
  background: '#FBFBFA',
  surface: '#FFFFFF',
  surfaceRaised: '#F3F4F3',
  inverse: '#0B0C0D',
  inverseText: '#FFFFFF',
  border: '#E4E6E5',
  borderStrong: '#C3C8C6',
  text: '#0B0C0D',
  textMuted: '#5A6260',
  textFaint: '#8B9391',
  // A lime accent needs darkening on white to hold AA against its own text.
  accent: '#3F6B00',
  accentText: '#FFFFFF',
  accentSoft: '#EDF7D9',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#8A5A00',
  success: '#136F42',
  highlight: '#4A6B00',
  overlay: 'rgba(11, 12, 13, 0.5)',
  track: '#E4E6E5',
};

export const palettes = { dark, light } as const;
export type ColorScheme = keyof typeof palettes;
export type ThemeColors = Palette;
