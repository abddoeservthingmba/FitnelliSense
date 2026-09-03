/**
 * The post-workout summary (FR-WK-10, J2 step 7).
 *
 * Duration, volume, set count — and any records, which are the only thing here
 * worth celebrating. Every figure was computed by the API from `@fi/domain`;
 * this sheet formats and nothing more.
 */
import { Modal, View } from 'react-native';
import { router } from 'expo-router';
import type { PersonalRecordHit, SessionComparison } from '@fi/shared';
import { ONE_RM_FORMULA_NAME } from '@fi/domain';
import { Button } from '../../components/Button';
import { Card, Row, Stack } from '../../components/Card';
import { Overline, Text } from '../../components/Text';
import { Stat, StatRow } from '../../components/Section';
import { formatDuration, formatPrType } from '../../lib/format';
import { useUnits } from '../../lib/use-units';
import { useTheme } from '../../theme';

export interface WorkoutSummarySheetProps {
  visible: boolean;
  workoutId: string;
  records: readonly PersonalRecordHit[];
  durationSecs: number;
  setCount: number;
  volumeLabel: string;
  /** FR-WK-10: what this session did relative to the last comparable one. */
  comparison: SessionComparison | null;
  onClose: () => void;
}

export function WorkoutSummarySheet({
  visible,
  workoutId,
  records,
  durationSecs,
  setCount,
  volumeLabel,
  comparison,
  onClose,
}: WorkoutSummarySheetProps) {
  const theme = useTheme();
  const units = useUnits();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            padding: theme.space.xl,
            paddingBottom: theme.space.xxl,
            gap: theme.space.lg,
          }}
        >
          <Stack gap="xs">
            <Text variant="heading">Workout saved</Text>
            <Text tone="muted">
              {records.length > 0
                ? `${records.length} personal record${records.length === 1 ? '' : 's'} in there.`
                : (comparison?.headline ?? 'Logged and safe. Consistency is the whole game.')}
            </Text>
          </Stack>

          <StatRow>
            <View style={{ flex: 1 }}>
              <Stat value={formatDuration(durationSecs)} label="Time" size="small" />
            </View>
            <View style={{ flex: 1 }}>
              <Stat value={volumeLabel} label="Volume" size="small" />
            </View>
            <View style={{ flex: 1 }}>
              <Stat value={String(setCount)} label="Sets" size="small" />
            </View>
          </StatRow>

          {records.length > 0 ? (
            <Card>
              <Stack gap="md">
                {records.map((record) => (
                  <Row key={`${record.exerciseId}-${record.prType}`} justify="space-between">
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="callout" weight="semibold">
                        {record.exerciseName}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {formatPrType(record.prType)}
                        {record.prType === 'best_1rm' ? ` (${ONE_RM_FORMULA_NAME})` : ''}
                        {record.previousValue ? ` · was ${units.weight(record.previousValue)}` : ''}
                      </Text>
                    </View>
                    <Text variant="callout" tone="highlight" weight="bold">
                      {record.prType === 'best_set_volume'
                        ? units.volume(record.value)
                        : units.weight(record.value)}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Card>
          ) : null}

          {comparison !== null && comparison.hasPrevious ? (
            <Card>
              <Stack gap="md">
                <Row justify="space-between">
                  <Overline>
                    {comparison.basis === 'same_routine'
                      ? 'vs last time you ran this routine'
                      : 'vs your last workout'}
                  </Overline>
                  {comparison.volumeChangePercent === null ? null : (
                    <Text
                      variant="caption"
                      weight="semibold"
                      tone={comparison.volumeChangePercent >= 0 ? 'success' : 'warning'}
                    >
                      {comparison.volumeChangePercent > 0 ? '+' : ''}
                      {comparison.volumeChangePercent}% volume
                    </Text>
                  )}
                </Row>

                {/* Only exercises that moved. A list of every lift that stayed
                    the same is noise at the end of a session. */}
                {comparison.exercises
                  .filter(
                    (exercise) =>
                      exercise.moreRepsAtSameWeight ||
                      (exercise.deltaWeightKg !== null && Number(exercise.deltaWeightKg) !== 0),
                  )
                  .slice(0, 4)
                  .map((exercise) => (
                    <Row key={exercise.exerciseId} justify="space-between">
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="caption" weight="semibold" numberOfLines={1}>
                          {exercise.exerciseName}
                        </Text>
                        <Text variant="micro" tone="faint">
                          {exercise.previousWeightKg === null
                            ? 'new'
                            : `was ${units.weight(exercise.previousWeightKg)} × ${exercise.previousReps}`}
                        </Text>
                      </View>
                      <Text
                        variant="caption"
                        weight="semibold"
                        tone={
                          exercise.moreRepsAtSameWeight || Number(exercise.deltaWeightKg ?? 0) > 0
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {exercise.moreRepsAtSameWeight
                          ? `+${(exercise.reps ?? 0) - (exercise.previousReps ?? 0)} reps`
                          : `${Number(exercise.deltaWeightKg) > 0 ? '+' : ''}${units.weight(
                              exercise.deltaWeightKg ?? '0',
                            )}`}
                      </Text>
                    </Row>
                  ))}
              </Stack>
            </Card>
          ) : null}

          <Stack gap="sm">
            <Button label="Done" onPress={onClose} size="large" fullWidth />
            <Button
              label="See the full workout"
              variant="ghost"
              onPress={() => {
                onClose();
                router.push(`/workout/${workoutId}`);
              }}
              fullWidth
            />
          </Stack>
        </View>
      </View>
    </Modal>
  );
}
