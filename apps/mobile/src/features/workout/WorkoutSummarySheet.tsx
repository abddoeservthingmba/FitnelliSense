/**
 * The post-workout summary (FR-WK-10, J2 step 7).
 *
 * Duration, volume, set count — and any records, which are the only thing here
 * worth celebrating. Every figure was computed by the API from `@fi/domain`;
 * this sheet formats and nothing more.
 */
import { Modal, View } from 'react-native';
import { router } from 'expo-router';
import type { PersonalRecordHit } from '@fi/shared';
import { ONE_RM_FORMULA_NAME } from '@fi/domain';
import { Button } from '../../components/Button';
import { Card, Row, Stack } from '../../components/Card';
import { Text } from '../../components/Text';
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
  onClose: () => void;
}

export function WorkoutSummarySheet({
  visible,
  workoutId,
  records,
  durationSecs,
  setCount,
  volumeLabel,
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
                : 'Logged and safe. Consistency is the whole game.'}
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
