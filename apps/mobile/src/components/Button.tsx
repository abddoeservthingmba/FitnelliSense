/**
 * The one button. Variants cover every action in the app; nothing builds its
 * own Pressable with its own padding.
 *
 * NFR-U-03: the minimum height is a 44 dp touch target. NFR-U-05: every button
 * carries an accessibility role and a label. Loading state keeps the label so
 * the layout does not jump.
 */
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { Text } from './Text';
import { useTheme, type Theme } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Fills the available width — the default for a screen's primary action. */
  fullWidth?: boolean;
  /** Enhancement only; never the sole signal that something happened. */
  haptic?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}

function colorsFor(theme: Theme, variant: ButtonVariant, disabled: boolean) {
  const map = {
    primary: { background: theme.colors.accent, text: theme.colors.accentText, border: 'transparent' },
    secondary: {
      background: theme.colors.surfaceRaised,
      text: theme.colors.text,
      border: theme.colors.border,
    },
    ghost: { background: 'transparent', text: theme.colors.accent, border: 'transparent' },
    danger: { background: theme.colors.dangerSoft, text: theme.colors.danger, border: 'transparent' },
  } as const;

  const chosen = map[variant];
  return disabled
    ? { ...chosen, background: theme.colors.surface, text: theme.colors.textFaint }
    : chosen;
}

const HEIGHTS: Record<ButtonSize, number> = { small: 44, medium: 48, large: 56 };

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

  const handlePress = () => {
    if (haptic && Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
          paddingHorizontal: size === 'small' ? theme.space.md : theme.space.lg,
          borderRadius: theme.radius.md,
          backgroundColor: colors.background,
          borderWidth: colors.border === 'transparent' ? 0 : 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.space.sm,
          opacity: pressed ? 0.85 : 1,
          ...(fullWidth ? { alignSelf: 'stretch' as const } : {}),
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.text} /> : icon}
      <View>
        <Text
          variant={size === 'large' ? 'callout' : 'body'}
          weight="semibold"
          style={{ color: colors.text }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
