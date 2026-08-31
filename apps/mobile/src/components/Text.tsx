/**
 * Typography. Every piece of text in the app goes through here, so sizes and
 * colours stay on the scale and text keeps scaling with the OS font size
 * without clipping (NFR-U-04).
 */
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme';

export type TextVariant =
  | 'display'
  | 'heading'
  | 'title'
  | 'body'
  | 'callout'
  | 'label'
  | 'caption'
  | 'metric';

export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'highlight';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  center?: boolean;
}

export function Text({
  variant = 'body',
  tone = 'default',
  weight,
  center = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const sizes: Record<TextVariant, number> = {
    display: theme.fontSize.display,
    heading: theme.fontSize.heading,
    title: theme.fontSize.title,
    callout: theme.fontSize.callout,
    body: theme.fontSize.body,
    label: theme.fontSize.footnote,
    caption: theme.fontSize.caption,
    metric: theme.fontSize.metric,
  };

  const defaultWeights: Record<TextVariant, TextProps['weight']> = {
    display: 'bold',
    heading: 'bold',
    title: 'semibold',
    callout: 'medium',
    body: 'regular',
    label: 'medium',
    caption: 'regular',
    metric: 'bold',
  };

  const tones: Record<TextTone, string> = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    highlight: theme.colors.highlight,
  };

  return (
    <RNText
      {...rest}
      style={[
        {
          color: tones[tone],
          fontSize: sizes[variant],
          fontWeight: theme.fontWeight[weight ?? defaultWeights[variant] ?? 'regular'],
          lineHeight: Math.round(sizes[variant] * (variant === 'metric' ? 1.15 : 1.4)),
          ...(center ? { textAlign: 'center' as const } : {}),
        },
        style,
      ]}
    />
  );
}
