/** A filter chip and a small status badge. Used by the exercise filters. */
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme';

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: theme.space.md,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="label" tone={selected ? 'accent' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'accent' | 'highlight' | 'danger';
}) {
  const theme = useTheme();
  const backgrounds = {
    muted: theme.colors.surfaceRaised,
    accent: theme.colors.accentSoft,
    highlight: theme.colors.surfaceRaised,
    danger: theme.colors.dangerSoft,
  } as const;

  return (
    <View
      style={{
        paddingHorizontal: theme.space.sm,
        paddingVertical: 2,
        borderRadius: theme.radius.sm,
        backgroundColor: backgrounds[tone],
      }}
    >
      <Text variant="caption" tone={tone === 'muted' ? 'muted' : tone} weight="medium">
        {label}
      </Text>
    </View>
  );
}
