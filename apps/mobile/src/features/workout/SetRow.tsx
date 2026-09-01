/**
 * One logged set (FR-WK-04, J2's "≤3 taps per set").
 *
 * The two numbers are the whole interface, so they are set large and tabular,
 * on a row tall enough to hit without looking. Type, type, tap the tick.
 *
 * A completed set drops its field chrome and turns the numbers accent — done
 * work should look settled, not still editable, even though it still is.
 * Values commit on blur and on completion, never per keystroke, so the network
 * is not asked to keep up with typing.
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { SetType, WorkoutSet } from '@fi/shared';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { useUnits } from '../../lib/use-units';

export interface SetRowProps {
  set: WorkoutSet;
  index: number;
  /** What the fields should start at when the set is empty (FR-WK-06). */
  placeholder: { weight: string; reps: string };
  onChange: (patch: { weightKg?: string | null; reps?: number | null }) => void;
  onToggleComplete: (isCompleted: boolean) => void;
  onLongPress: () => void;
}

const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: '',
  warmup: 'W',
  failure: 'F',
  drop: 'D',
};

export const SetRow = memo(function SetRow({
  set,
  index,
  placeholder,
  onChange,
  onToggleComplete,
  onLongPress,
}: SetRowProps) {
  const theme = useTheme();
  const units = useUnits();

  // Local field state, so typing is never blocked by a round trip.
  const [weight, setWeight] = useState(() => units.toInput(set.weightKg));
  const [reps, setReps] = useState(() => (set.reps === null ? '' : String(set.reps)));

  // Adopt server or optimistic changes that did not come from this field.
  useEffect(() => {
    setWeight(units.toInput(set.weightKg));
  }, [set.weightKg, units]);
  useEffect(() => {
    setReps(set.reps === null ? '' : String(set.reps));
  }, [set.reps]);

  const commitWeight = () => {
    const next = units.fromInput(weight);
    if (next !== set.weightKg) onChange({ weightKg: next });
  };

  const commitReps = () => {
    const parsed = reps.trim() === '' ? null : Number.parseInt(reps, 10);
    const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    if (next !== set.reps) onChange({ reps: next });
  };

  const complete = () => {
    // Commit whatever is in the fields before marking the set done, so a tick
    // never records a stale number.
    commitWeight();
    commitReps();
    onToggleComplete(!set.isCompleted);
  };

  const fieldStyle = {
    flex: 1,
    minHeight: 52,
    textAlign: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: set.isCompleted ? 'transparent' : theme.colors.border,
    backgroundColor: set.isCompleted ? 'transparent' : theme.colors.surfaceRaised,
    color: set.isCompleted ? theme.colors.accent : theme.colors.text,
    fontSize: theme.fontSize.title,
    fontWeight: theme.fontWeight.heavy,
    letterSpacing: theme.tracking.snug,
    paddingHorizontal: theme.space.sm,
  };

  const typeLabel = SET_TYPE_LABEL[set.setType];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.sm,
        paddingVertical: theme.space.xs,
      }}
    >
      <Pressable
        onPress={onLongPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`Set ${index + 1} options`}
        hitSlop={10}
        style={{ width: 26, alignItems: 'center' }}
      >
        <Text variant="micro" tone={typeLabel ? 'accent' : 'faint'} weight="heavy" overline>
          {typeLabel || index + 1}
        </Text>
      </Pressable>

      <TextInput
        value={weight}
        onChangeText={setWeight}
        onBlur={commitWeight}
        placeholder={placeholder.weight}
        placeholderTextColor={theme.colors.textFaint}
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="next"
        accessibilityLabel={`Set ${index + 1} weight in ${units.label}`}
        selectTextOnFocus
        style={fieldStyle}
      />

      <TextInput
        value={reps}
        onChangeText={setReps}
        onBlur={commitReps}
        placeholder={placeholder.reps}
        placeholderTextColor={theme.colors.textFaint}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="done"
        accessibilityLabel={`Set ${index + 1} reps`}
        selectTextOnFocus
        style={fieldStyle}
      />

      <Pressable
        onPress={complete}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.isCompleted }}
        accessibilityLabel={`Mark set ${index + 1} ${set.isCompleted ? 'not done' : 'done'}`}
        style={({ pressed }) => ({
          width: 52,
          height: 52,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: set.isCompleted ? theme.colors.accent : 'transparent',
          borderWidth: 1,
          borderColor: set.isCompleted ? theme.colors.accent : theme.colors.border,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          variant="callout"
          weight="heavy"
          style={{ color: set.isCompleted ? theme.colors.accentText : theme.colors.textFaint }}
        >
          ✓
        </Text>
      </Pressable>
    </View>
  );
});
