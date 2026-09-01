/**
 * Structural pieces: section headers, stat figures, rows and rules.
 *
 * The editorial layout leans on rules and whitespace rather than nested cards,
 * so most of this file is about horizontal lines and typographic hierarchy.
 */
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Overline, Text } from './Text';
import { useTheme } from '../theme';

/**
 * A section: an uppercase label, a hairline rule across the full width, and
 * the content beneath. The rule is what makes it read as a printed page rather
 * than a stack of cards.
 */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space.md }}>
      <View style={{ gap: theme.space.sm }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Overline>{title}</Overline>
          {action ? (
            <Pressable
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={12}
            >
              <Text variant="micro" tone="accent" weight="heavy" overline>
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Rule />
      </View>
      {children}
    </View>
  );
}

export function Rule({ strong = false }: { strong?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: strong ? 2 : 1,
        backgroundColor: strong ? theme.colors.text : theme.colors.border,
      }}
    />
  );
}

/**
 * A single figure with its label beneath — the unit of information on every
 * summary in the app. The number leads; the label explains it afterwards, in
 * small caps, which is the whole editorial idea in one component.
 */
export function Stat({
  value,
  label,
  tone = 'default',
  size = 'medium',
  align = 'flex-start',
}: {
  value: string;
  label: string;
  tone?: 'default' | 'accent' | 'highlight' | 'muted';
  size?: 'small' | 'medium' | 'large';
  align?: ViewStyle['alignItems'];
}) {
  const theme = useTheme();
  const variant = size === 'large' ? 'metric' : size === 'medium' ? 'display' : 'heading';

  return (
    <View style={{ gap: theme.space.xs, alignItems: align }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant={variant} tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Overline>{label}</Overline>
    </View>
  );
}

/** Stats laid out in a row, separated by vertical rules. */
export function StatRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.lg }}>
      {children}
    </View>
  );
}

/** A tappable row: title, optional subtitle, optional leading and trailing slots. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        minHeight: 64,
        paddingVertical: theme.space.sm,
      }}
    >
      {leading}
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="callout" weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/** A horizontal progress bar. Square, flush, no rounding — it reads as a meter. */
export function Meter({
  progress,
  tone = 'accent',
  height = 6,
}: {
  /** 0 to 1. */
  progress: number;
  tone?: 'accent' | 'text';
  height?: number;
}) {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height, backgroundColor: theme.colors.track, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: tone === 'accent' ? theme.colors.accent : theme.colors.text,
        }}
      />
    </View>
  );
}

export function Spacer({ size = 'lg' }: { size?: keyof ReturnType<typeof useTheme>['space'] }) {
  const theme = useTheme();
  return <View style={{ height: theme.space[size] }} />;
}

export type { StyleProp, ViewStyle };
