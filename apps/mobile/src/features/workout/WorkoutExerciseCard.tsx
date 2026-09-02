/**
 * One exercise inside a live workout: its sets, and the one button that adds
 * another (FR-WK-04, FR-WK-06, FR-WK-07, FR-WK-09).
 *
 * Split out of the workout screen deliberately — the screen orchestrates, this
 * renders one exercise, and `SetRow` renders one set. No component here knows
 * about more than its own level.
 */
import { memo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseKind, WorkoutExercise } from '@fi/shared';
import { Button } from '../../components/Button';
import { Card, Divider, Row, Stack } from '../../components/Card';
import { Overline, Text } from '../../components/Text';
import { formatPrefillOrigin } from '../../lib/format';
import { useUnits } from '../../lib/use-units';
import { SetRow } from './SetRow';
import type { PrefillSuggestion } from './use-prefill';

export interface WorkoutExerciseCardProps {
  exercise: WorkoutExercise;
  /** Which numbers this exercise takes. Drives the headers and the fields. */
  kind: ExerciseKind;
  prefill: PrefillSuggestion;
  onAddSet: () => void;
  onUpdateSet: (
    setId: string,
    patch: {
      weightKg?: string | null;
      reps?: number | null;
      durationSecs?: number | null;
      distanceM?: number | null;
    },
  ) => void;
  onCompleteSet: (setId: string, isCompleted: boolean) => void;
  onDeleteSet: (setId: string) => void;
  onRemove: () => void;
}

export const WorkoutExerciseCard = memo(function WorkoutExerciseCard({
  exercise,
  kind,
  prefill,
  onAddSet,
  onUpdateSet,
  onCompleteSet,
  onDeleteSet,
  onRemove,
}: WorkoutExerciseCardProps) {
  const units = useUnits();

  const completed = exercise.sets.filter((set) => set.isCompleted).length;
  const originHint = formatPrefillOrigin(prefill.origin);

  return (
    <Card>
      <Stack gap="md">
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text
              variant="callout"
              weight="semibold"
              onPress={() => router.push(`/exercise/${exercise.exerciseId}`)}
              accessibilityRole="link"
            >
              {exercise.exerciseName}
            </Text>
            <Text variant="caption" tone="muted">
              {completed} of {exercise.sets.length || '—'} set
              {exercise.sets.length === 1 ? '' : 's'} done
              {originHint ? ` · prefilled ${originHint}` : ''}
            </Text>
          </View>
          <Button
            label="Remove"
            size="small"
            variant="ghost"
            onPress={onRemove}
            accessibilityHint={`Remove ${exercise.exerciseName} from this workout`}
          />
        </Row>

        <Divider />

        {/* Column headers, so the two bare number fields are unambiguous. */}
        <Row gap="sm">
          <View style={{ width: 26 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Overline>{kind === 'cardio' ? 'minutes' : units.label}</Overline>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Overline>{kind === 'cardio' ? 'km' : 'reps'}</Overline>
          </View>
          <View style={{ width: 52 }} />
        </Row>

        {exercise.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            index={index}
            kind={kind}
            placeholder={prefill.placeholder}
            onChange={(patch) => onUpdateSet(set.id, patch)}
            onToggleComplete={(isCompleted) => onCompleteSet(set.id, isCompleted)}
            onLongPress={() => onDeleteSet(set.id)}
          />
        ))}

        <Button label="Add set" variant="secondary" onPress={onAddSet} fullWidth haptic />
      </Stack>
    </Card>
  );
});
