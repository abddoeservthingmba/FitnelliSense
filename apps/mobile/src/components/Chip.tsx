/**
 * Selection controls: the small filter chip, the status badge, and the large
 * choice tile onboarding is built from.
 *
 * Editorial treatment: square corners, uppercase tracked labels, and selection
 * shown by inverting the block rather than tinting it — no ambiguity about
 * what is chosen, at a glance, mid-set.
 */
import { Pressable, View } from 'react-native';
import { Overline, Text } from './Text';
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
      hitSlop={8}
      style={({ pressed }) => ({
        minHeight: 38,
        justifyContent: 'center',
        paddingHorizontal: theme.space.md,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: selected ? theme.colors.text : theme.colors.border,
        backgroundColor: selected ? theme.colors.text : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        variant="micro"
        weight="heavy"
        overline
        style={{ color: selected ? theme.colors.background : theme.colors.textMuted }}
      >
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
    highlight: theme.colors.accentSoft,
    danger: theme.colors.dangerSoft,
  } as const;

  return (
    <View
      style={{
        paddingHorizontal: theme.space.sm,
        paddingVertical: 3,
        borderRadius: theme.radius.sm,
        backgroundColor: backgrounds[tone],
      }}
    >
      <Text variant="micro" tone={tone === 'muted' ? 'muted' : tone} weight="heavy" overline>
        {label}
      </Text>
    </View>
  );
}

/**
 * A large selectable tile — the onboarding answer. Sized for a confident thumb
 * rather than a precise one, with room for a line of explanation, because
 * "intermediate" means nothing without it.
 */
export function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => ({
        padding: theme.space.lg,
        borderRadius: theme.radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
        opacity: pressed ? 0.8 : 1,
        gap: 4,
      })}
    >
      <Text variant="callout" weight="semibold" tone={selected ? 'accent' : 'default'}>
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A compact numeric option — "3 days", "45 min". Laid out in a row, so the
 * whole question is answerable without scrolling.
 */
export function ChoicePill({
  value,
  unit,
  selected,
  onPress,
  accessibilityLabel,
}: {
  value: string;
  unit?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        borderRadius: theme.radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="title" weight="heavy" tone={selected ? 'accent' : 'default'}>
        {value}
      </Text>
      {unit ? <Overline tone={selected ? 'accent' : 'faint'}>{unit}</Overline> : null}
    </Pressable>
  );
}
