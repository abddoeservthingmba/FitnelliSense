/** A surface. Used for every grouped block, so elevation stays consistent. */
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, accessibilityLabel, padded = true, style }: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...(padded ? { padding: theme.space.lg } : {}),
    overflow: 'hidden',
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={({ pressed }) => [base, { opacity: pressed ? 0.75 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** A hairline divider that respects the theme. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: inset }}
      accessibilityRole="none"
    />
  );
}

/** Vertical rhythm without a stack of magic margins. */
export function Stack({
  children,
  gap = 'md',
  style,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return <View style={[{ gap: theme.space[gap] }, style]}>{children}</View>;
}

/** Horizontal layout with the same spacing scale. */
export function Row({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  style,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
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
