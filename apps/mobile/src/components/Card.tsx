/**
 * Surfaces and layout primitives.
 *
 * Editorial layouts use fewer cards than card-based ones — most grouping is
 * done with rules and space. A `Card` here is therefore a deliberate block,
 * not the default container, and `Block` is the solid inverse panel used for
 * the one thing on a screen that matters most.
 */
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  /** Draws the hairline border. Off for a card sitting on its own rule. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  padded = true,
  bordered = true,
  style,
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...(bordered ? { borderWidth: 1, borderColor: theme.colors.border } : {}),
    ...(padded ? { padding: theme.space.lg } : {}),
    overflow: 'hidden',
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={({ pressed }) => [base, { opacity: pressed ? 0.7 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

/**
 * The inverse block: light panel on the dark ground (and vice versa). Reserved
 * for the primary moment on a screen — resume a workout, the finished summary —
 * so its appearance always means "this is the thing".
 */
export function Block({
  children,
  onPress,
  accent = false,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Lime instead of the inverse neutral. Used at most once per screen. */
  accent?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: accent ? theme.colors.accent : theme.colors.inverse,
    borderRadius: theme.radius.lg,
    padding: theme.space.xl,
    overflow: 'hidden',
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** A hairline divider that respects the theme. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: inset }} />;
}

/** Vertical rhythm without a stack of magic margins. */
export function Stack({
  children,
  gap = 'md',
  style,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return <View style={[{ gap: theme.space[gap] }, style]}>{children}</View>;
}

/** Horizontal layout on the same spacing scale. */
export function Row({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  style,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: theme.space[gap],
          alignItems: align,
          justifyContent: justify,
          ...(wrap ? { flexWrap: 'wrap' as const } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
