/**
 * Typography. Every piece of text in the app goes through here.
 *
 * The editorial look comes almost entirely from this file: numerals set large
 * with negative tracking so they read as a single shape, and small uppercase
 * labels with positive tracking doing the work that borders and chrome would
 * otherwise do. Text still scales with the OS font size (NFR-U-04).
 */
import { Platform, Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme';

export type TextVariant =
  | 'hero'
  | 'display'
  | 'heading'
  | 'title'
  | 'callout'
  | 'body'
  | 'label'
  | 'caption'
  | 'micro'
  /** A large figure: weight, volume, a countdown. Tabular so it never jitters. */
  | 'metric';

export type TextTone =
  | 'default'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'danger'
  | 'highlight'
  | 'inverse';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: keyof ReturnType<typeof useTheme>['fontWeight'];
  center?: boolean;
  /** Uppercase with wide tracking — the editorial section label. */
  overline?: boolean;
}

/**
 * Digits that do not change width as they count. Without this a running timer
 * visibly twitches on every tick, which on a 46px numeral is impossible to miss.
 */
const TABULAR = Platform.select({
  ios: { fontVariant: ['tabular-nums' as const] },
  android: { fontVariant: ['tabular-nums' as const] },
  default: { fontVariant: ['tabular-nums' as const] },
});

export function Text({
  variant = 'body',
  tone = 'default',
  weight,
  center = false,
  overline = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const sizes: Record<TextVariant, number> = {
    hero: theme.fontSize.hero,
    metric: theme.fontSize.metric,
    display: theme.fontSize.display,
    heading: theme.fontSize.heading,
    title: theme.fontSize.title,
    callout: theme.fontSize.callout,
    body: theme.fontSize.body,
    label: theme.fontSize.footnote,
    caption: theme.fontSize.caption,
    micro: theme.fontSize.micro,
  };

  const defaultWeights: Record<TextVariant, TextProps['weight']> = {
    hero: 'heavy',
    metric: 'heavy',
    display: 'heavy',
    heading: 'bold',
    title: 'semibold',
    callout: 'medium',
    body: 'regular',
    label: 'medium',
    caption: 'regular',
    micro: 'semibold',
  };

  // Big type tightens, small type opens up.
  const trackings: Record<TextVariant, number> = {
    hero: theme.tracking.tight,
    metric: theme.tracking.tight,
    display: theme.tracking.tight,
    heading: theme.tracking.snug,
    title: theme.tracking.snug,
    callout: theme.tracking.normal,
    body: theme.tracking.normal,
    label: theme.tracking.normal,
    caption: theme.tracking.normal,
    micro: theme.tracking.wide,
  };

  const tones: Record<TextTone, string> = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    highlight: theme.colors.highlight,
    inverse: theme.colors.inverseText,
  };

  const isNumeric = variant === 'metric' || variant === 'hero';
  const size = sizes[variant];

  return (
    <RNText
      {...rest}
      style={[
        {
          color: tones[tone],
          fontSize: size,
          fontWeight: theme.fontWeight[weight ?? defaultWeights[variant] ?? 'regular'],
          letterSpacing: overline ? theme.tracking.wider : trackings[variant],
          lineHeight: Math.round(size * (isNumeric ? 1.05 : 1.4)),
          ...(overline ? { textTransform: 'uppercase' as const } : {}),
          ...(center ? { textAlign: 'center' as const } : {}),
          ...(isNumeric ? TABULAR : {}),
        },
        style,
      ]}
    />
  );
}

/**
 * The section label used throughout: uppercase, tracked, quiet. Its own
 * component because it appears on nearly every screen and should never drift.
 */
export function Overline({
  children,
  tone = 'faint',
}: {
  children: React.ReactNode;
  tone?: TextTone;
}) {
  return (
    <Text variant="micro" tone={tone} overline accessibilityRole="header">
      {children}
    </Text>
  );
}
