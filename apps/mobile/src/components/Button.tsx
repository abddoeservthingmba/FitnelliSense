/**
 * The one button.
 *
 * Editorial hierarchy: the primary action is a solid inverse block with an
 * uppercase tracked label — unmistakable, and there is only ever one per
 * screen. `accent` is reserved for the single moment that deserves the lime.
 * Everything else recedes to outline or bare text.
 *
 * NFR-U-03: the minimum height is a 44 dp touch target. NFR-U-05: every button
 * carries a role and a label. The label stays visible while loading so the
 * layout never jumps.
 */
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { useTheme, type Theme } from '../theme';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Enhancement only; never the sole signal that something happened. */
  haptic?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}

function colorsFor(theme: Theme, variant: ButtonVariant, disabled: boolean) {
  const map = {
    primary: {
      background: theme.colors.inverse,
      text: theme.colors.inverseText,
      border: 'transparent',
    },
    accent: {
      background: theme.colors.accent,
      text: theme.colors.accentText,
      border: 'transparent',
    },
    secondary: {
      background: 'transparent',
      text: theme.colors.text,
      border: theme.colors.borderStrong,
    },
    ghost: { background: 'transparent', text: theme.colors.textMuted, border: 'transparent' },
    danger: { background: 'transparent', text: theme.colors.danger, border: theme.colors.danger },
  } as const;

  const chosen = map[variant];
  return disabled
    ? { background: theme.colors.surfaceRaised, text: theme.colors.textFaint, border: 'transparent' }
    : chosen;
}

const HEIGHTS: Record<ButtonSize, number> = { small: 44, medium: 50, large: 58 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  haptic = false,
  accessibilityHint,
  style,
  icon,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const colors = colorsFor(theme, variant, inactive);
  // Solid blocks carry the uppercase treatment; quiet actions stay sentence case.
  const isBlock = variant === 'primary' || variant === 'accent';

  const handlePress = () => {
    if (haptic && Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      style={({ pressed }) => [
        {
          minHeight: HEIGHTS[size],
          paddingHorizontal: size === 'small' ? theme.space.md : theme.space.xl,
          borderRadius: theme.radius.md,
          backgroundColor: colors.background,
          borderWidth: colors.border === 'transparent' ? 0 : 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.space.sm,
          // A press dims the block rather than scaling it — quieter, and it
          // does not reflow anything around it.
          opacity: pressed ? 0.72 : 1,
          ...(fullWidth ? { alignSelf: 'stretch' as const } : {}),
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.text} /> : icon}
      <View>
        <Text
          variant={isBlock ? 'micro' : 'body'}
          weight={isBlock ? 'heavy' : 'semibold'}
          overline={isBlock}
          style={{ color: colors.text }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
