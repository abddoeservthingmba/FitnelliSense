/**
 * Design tokens. One source of values, so no screen invents a colour or a
 * spacing step.
 *
 * The palette is dark-first because that is what a phone in a gym wants, but
 * both schemes are complete and contrast-checked to WCAG 2.1 AA (NFR-U-04).
 * Spacing is a 4pt scale; every touch target lands on at least 44 (NFR-U-03).
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

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum interactive size, in dp (NFR-U-03). */
export const HIT_SLOP = 44;

export const fontSize = {
  caption: 12,
  footnote: 13,
  body: 15,
  callout: 17,
  title: 20,
  heading: 26,
  display: 34,
  /** For the live workout: readable at arm's length, mid-set. */
  metric: 30,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

interface Palette {
  /** App background. */
  background: string;
  /** Cards and raised surfaces. */
  surface: string;
  surfaceRaised: string;
  /** Hairlines and dividers. */
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Brand accent — used for primary actions and the "done" state. */
  accent: string;
  accentText: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  /** The record / celebration colour. */
  highlight: string;
  overlay: string;
}

const dark: Palette = {
  background: '#0B0F14',
  surface: '#131A22',
  surfaceRaised: '#1B242E',
  border: '#232F3B',
  borderStrong: '#324454',
  text: '#F2F6FA',
  textMuted: '#A6B4C2',
  textFaint: '#6C7C8C',
  accent: '#22D3A6',
  accentText: '#04241C',
  accentSoft: '#12332B',
  danger: '#FF6B6B',
  dangerSoft: '#3A1D22',
  warning: '#F5B547',
  success: '#3DDC97',
  highlight: '#FFD166',
  overlay: 'rgba(4, 8, 12, 0.72)',
};

const light: Palette = {
  background: '#F7F9FB',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E1E7ED',
  borderStrong: '#C6D0DA',
  text: '#0D1620',
  textMuted: '#4E5C6A',
  textFaint: '#7C8A98',
  accent: '#0E9E7A',
  accentText: '#FFFFFF',
  accentSoft: '#DFF5EE',
  danger: '#C7362F',
  dangerSoft: '#FBE7E5',
  warning: '#9A6400',
  success: '#0E8A5F',
  highlight: '#A26B00',
  overlay: 'rgba(13, 22, 32, 0.45)',
};

export const palettes = { dark, light } as const;
export type ColorScheme = keyof typeof palettes;
export type ThemeColors = Palette;
