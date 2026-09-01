/**
 * Design tokens — the System.
 *
 * A Solo Leveling notification window: near-black void, cyan light that looks
 * like it is emitting rather than painted, hard corners, uppercase tracked
 * labels, and numbers set large because the numbers are the whole point.
 *
 * Two rules keep it from becoming unusable in a gym:
 *
 * - **Cyan is light, not decoration.** It marks what is live, earned or
 *   actionable. Everything inert stays in the greys, so the glow means
 *   something when it appears.
 * - **Contrast is not sacrificed to atmosphere.** Every text pairing here holds
 *   WCAG 2.1 AA (NFR-U-04) and every touch target still lands on 44 dp
 *   (NFR-U-03). A dark theme that cannot be read in daylight is a worse theme.
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

/** System windows are cut, not rounded. */
export const radius = {
  sm: 2,
  md: 4,
  lg: 6,
  pill: 999,
} as const;

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
  metric: 46,
  /** The level numeral, and the rank glyph. */
  hero: 72,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export const tracking = {
  tight: -1.4,
  snug: -0.4,
  normal: 0,
  wide: 1,
  /** System labels. Wide enough to read as machine output. */
  wider: 2.2,
} as const;

export const duration = {
  fast: 120,
  base: 240,
  slow: 420,
  /** The level-up window's entrance. Long enough to feel like an event. */
  reveal: 700,
} as const;

interface Palette {
  background: string;
  /** A System window's fill. */
  surface: string;
  surfaceRaised: string;
  /** The panel behind a notification — deeper than the page. */
  well: string;
  inverse: string;
  inverseText: string;
  border: string;
  borderStrong: string;
  /** The glowing edge of an active window. */
  borderGlow: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** System cyan. Live, earned, actionable. */
  accent: string;
  accentText: string;
  accentSoft: string;
  /** Monarch violet — rank S, monarch badges, the rarest moments. */
  monarch: string;
  monarchSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  /** Gold, for records and high-tier badges. */
  highlight: string;
  overlay: string;
  track: string;
}

const dark: Palette = {
  background: '#04060B',
  surface: '#0A1018',
  surfaceRaised: '#111A26',
  well: '#070C13',
  inverse: '#E8F4FF',
  inverseText: '#04060B',
  border: '#16232F',
  borderStrong: '#25394A',
  borderGlow: '#2FD9FF',
  text: '#E8F4FF',
  textMuted: '#8FA6B8',
  textFaint: '#5A7186',
  accent: '#2FD9FF',
  accentText: '#00131A',
  accentSoft: '#0A2A36',
  monarch: '#A970FF',
  monarchSoft: '#1E1233',
  danger: '#FF5C6E',
  dangerSoft: '#2B0F16',
  warning: '#FFB84D',
  success: '#3DF5A5',
  highlight: '#FFC94D',
  overlay: 'rgba(2, 4, 8, 0.88)',
  track: '#132030',
};

/**
 * The System in daylight. The same structure, inverted — kept genuinely usable
 * rather than a token gesture, because a phone in a bright gym is the common
 * case and NFR-U-06 promises the system preference is followed.
 */
const light: Palette = {
  background: '#F4F7FA',
  surface: '#FFFFFF',
  surfaceRaised: '#EDF2F7',
  well: '#E4EBF2',
  inverse: '#06121C',
  inverseText: '#FFFFFF',
  border: '#D3DEE8',
  borderStrong: '#A9BDCE',
  borderGlow: '#0077A3',
  text: '#06121C',
  textMuted: '#4A5F71',
  textFaint: '#7B8FA1',
  accent: '#0077A3',
  accentText: '#FFFFFF',
  accentSoft: '#DDF1F9',
  monarch: '#6A34C4',
  monarchSoft: '#EEE6FB',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#8A5A00',
  success: '#0E7A52',
  highlight: '#8A6100',
  overlay: 'rgba(6, 18, 28, 0.55)',
  track: '#D3DEE8',
};

export const palettes = { dark, light } as const;
export type ColorScheme = keyof typeof palettes;
export type ThemeColors = Palette;

/** Rank colours. S and the monarch tier get the violet; the rest climb the greys into cyan. */
export const RANK_COLORS: Record<string, keyof ThemeColors> = {
  E: 'textFaint',
  D: 'textMuted',
  C: 'text',
  B: 'accent',
  A: 'highlight',
  S: 'monarch',
};

export const BADGE_TIER_COLORS: Record<string, keyof ThemeColors> = {
  bronze: 'textMuted',
  silver: 'text',
  gold: 'highlight',
  monarch: 'monarch',
};
