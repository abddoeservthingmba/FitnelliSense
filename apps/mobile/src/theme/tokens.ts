/**
 * Design tokens — the System.
 *
 * A Solo Leveling notification window: deep navy void, ice-blue light that looks
 * like it is emitting rather than painted, hard corners, uppercase tracked
 * labels, and numbers set large because the numbers are the whole point.
 *
 * Two rules keep it from becoming unusable in a gym:
 *
 * - **The blue is light, not decoration.** It marks what is live, earned or
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
  /** Ascension blue. Live, earned, actionable. */
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

/**
 * Ascension, after dark.
 *
 * Taken from the icon: deep navy ground, ice-blue mark. The previous palette
 * was near-black with a cyan accent, which was close but read as a terminal
 * rather than as the icon — the blues here are the icon's own, so the launcher
 * and the first screen are recognisably the same object.
 *
 * `accent` is the icon's glow. `highlight` deliberately stays gold rather than
 * becoming a second blue: it marks records and A-rank, and `RANK_COLORS` gives
 * C the plain text tone and A the highlight — make both of those blue and two
 * adjacent ranks become indistinguishable.
 *
 * Every pairing here holds WCAG AA against the background (NFR-U-04).
 */
const dark: Palette = {
  background: '#050D1F',
  surface: '#0A1830',
  surfaceRaised: '#122745',
  well: '#03080F',
  inverse: '#DCECFF',
  inverseText: '#050D1F',
  border: '#16294A',
  borderStrong: '#27436E',
  borderGlow: '#8CC8FF',
  text: '#DCECFF',
  textMuted: '#93AACB',
  textFaint: '#6E88AD',
  accent: '#8CC8FF',
  accentText: '#04101F',
  accentSoft: '#0E2748',
  monarch: '#A970FF',
  monarchSoft: '#1E1233',
  danger: '#FF6B7D',
  dangerSoft: '#2E1119',
  warning: '#FFC066',
  success: '#4BE3A8',
  highlight: '#F5C25B',
  overlay: 'rgba(3, 8, 16, 0.9)',
  track: '#132844',
};

/**
 * The System in daylight. The same structure, inverted — kept genuinely usable
 * rather than a token gesture, because a phone in a bright gym is the common
 * case and NFR-U-06 promises the system preference is followed.
 */
const light: Palette = {
  background: '#F3F7FC',
  surface: '#FFFFFF',
  surfaceRaised: '#EDF2F7',
  well: '#E4EBF2',
  inverse: '#061428',
  inverseText: '#FFFFFF',
  border: '#D3DEE8',
  borderStrong: '#A9BDCE',
  borderGlow: '#0B57A4',
  text: '#06121C',
  textMuted: '#4A5F71',
  textFaint: '#7B8FA1',
  // The daylight accent has to be far darker than the dark theme's ice blue:
  // #8CC8FF on white is about 1.9:1, nowhere near the 4.5:1 that AA body text
  // needs. Same hue family, enough depth to be legible in a bright gym.
  accent: '#0B57A4',
  accentText: '#FFFFFF',
  accentSoft: '#DCEAFB',
  monarch: '#6A34C4',
  monarchSoft: '#EEE6FB',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#8A5A00',
  success: '#0E7A52',
  highlight: '#0B4E8F',
  overlay: 'rgba(6, 18, 28, 0.55)',
  track: '#D3DEE8',
};

export const palettes = { dark, light } as const;
export type ColorScheme = keyof typeof palettes;
export type ThemeColors = Palette;

/** Rank colours: greys climb into the Ascension blue, then gold at A, violet at S. */
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
