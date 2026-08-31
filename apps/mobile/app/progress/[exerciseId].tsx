/**
 * Per-exercise progress (FR-HP-04, FR-HP-05, J3).
 *
 * One chart, one metric at a time, with the metric switcher directly under it.
 * When the metric is an estimate, the formula is named on the page — a derived
 * number is never presented as a measurement.
 */
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PROGRESS_METRICS, type ProgressMetric } from '@fi/domain';
import { useExerciseProgress, usePersonalRecords } from '../../src/api/hooks/use-history';
import { Card, Row, Stack } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { Screen } from '../../src/components/Screen';
import { Section } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/StateViews';
import { ProgressChart } from '../../src/features/progress/ProgressChart';
import { formatMetric, formatPrType, formatWorkoutDate } from '../../src/lib/format';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

/** Reps are a count; everything else is a load or a load-derived figure. */
function unitFor(metric: ProgressMetric, weightLabel: string): string {
  return metric === 'total_reps' ? 'reps' : weightLabel;
}

export default function ExerciseProgressScreen() {
  const theme = useTheme();
  const units = useUnits();
  const { width } = useWindowDimensions();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();

  const [metric, setMetric] = useState<ProgressMetric>('estimated_1rm');
  const progress = useExerciseProgress(exerciseId, metric);
  const records = usePersonalRecords();

  if (progress.isLoading) return <LoadingState />;
  if (progress.isError || !progress.data) {
    return <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />;
  }

  const series = progress.data;
  const exerciseRecords =
    records.data?.records.filter((record) => record.exerciseId === exerciseId) ?? [];

  // Chart width: the screen, minus the screen padding and the card's own.
  const chartWidth = Math.min(width, 720) - theme.space.lg * 2 - theme.space.lg * 2;

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.md }}>
        <Stack gap="xs">
          <Text variant="heading">{series.exerciseName}</Text>
          <Text variant="caption" tone="muted">
            {series.points.length} session{series.points.length === 1 ? '' : 's'} logged
          </Text>
        </Stack>

        {series.points.length === 0 ? (
          <EmptyState
            title="No data yet"
            body="Log this exercise in a workout and the trend appears here."
          />
        ) : (
          <Card>
            <Stack gap="md">
              <ProgressChart
                points={series.points}
                unitLabel={unitFor(metric, units.label)}
                width={chartWidth}
              />
              <Row gap="sm" wrap>
                {PROGRESS_METRICS.map((option) => (
                  <Chip
                    key={option}
                    label={formatMetric(option)}
                    selected={metric === option}
                    onPress={() => setMetric(option)}
                  />
                ))}
              </Row>
              {/* FR-HP-05: the formula is displayed, not implied. */}
              {series.formula ? (
                <Text variant="caption" tone="faint">
                  Estimated with {series.formula}
                </Text>
              ) : null}
            </Stack>
          </Card>
        )}

        {exerciseRecords.length > 0 ? (
          <Section title="Personal records">
            <Card>
              <Stack gap="md">
                {exerciseRecords.map((record) => (
                  <Row key={record.id} justify="space-between">
                    <View style={{ gap: 2 }}>
                      <Text variant="callout">{formatPrType(record.prType)}</Text>
                      <Text variant="caption" tone="muted">
                        {formatWorkoutDate(record.achievedAt)}
                        {record.reps !== null && record.weightKg !== null
                          ? ` · ${units.weight(record.weightKg)} × ${record.reps}`
                          : ''}
                      </Text>
                    </View>
                    <Text variant="callout" tone="highlight" weight="semibold">
                      {record.prType === 'best_set_volume'
                        ? units.volume(record.value)
                        : units.weight(record.value)}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Card>
          </Section>
        ) : null}
      </Stack>
    </Screen>
  );
}
