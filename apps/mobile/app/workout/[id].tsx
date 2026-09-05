/**
 * A past workout (FR-HP-02, FR-HP-03).
 *
 * Every set exactly as it was logged — this screen is the visible proof of the
 * product's core promise that nothing is lost. It also offers the one action
 * people want from history: do this again.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useWorkout } from '../../src/api/hooks/use-workout';
import { useWorkoutAnalyses } from '../../src/api/hooks/use-analysis';
import { useRoutineFromWorkout } from '../../src/api/hooks/use-routines';
import { Button } from '../../src/components/Button';
import { Card, Divider, Row, Stack } from '../../src/components/Card';
import { Badge } from '../../src/components/Chip';
import { Screen } from '../../src/components/Screen';
import { Stat, StatRow } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { formatDuration, formatTime, formatWorkoutDate } from '../../src/lib/format';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

const SET_TYPE_BADGE: Record<string, string> = {
  warmup: 'Warmup',
  failure: 'To failure',
  drop: 'Drop set',
};

export default function WorkoutDetailScreen() {
  const theme = useTheme();
  const units = useUnits();
  const { id } = useLocalSearchParams<{ id: string }>();

  const workout = useWorkout(id);
  /*
   * Which sets were filmed, in ONE request rather than one per set. Indexed by
   * set id by the hook, so a row is a map lookup rather than a search.
   */
  const analyses = useWorkoutAnalyses(id ?? null);
  const createRoutine = useRoutineFromWorkout();
  const [saved, setSaved] = useState(false);

  if (workout.isLoading) return <LoadingState />;
  if (workout.isError || !workout.data) {
    return <ErrorState error={workout.error} onRetry={() => void workout.refetch()} />;
  }

  const detail = workout.data;

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.md }}>
        <Stack gap="xs">
          <Text variant="heading">{detail.name ?? 'Workout'}</Text>
          <Text variant="caption" tone="muted">
            {formatWorkoutDate(detail.startedAt)} · {formatTime(detail.startedAt)}
          </Text>
        </Stack>

        <StatRow>
          <View style={{ flex: 1 }}>
            <Stat value={units.volume(detail.totalVolumeKg)} label="Volume" size="small" />
          </View>
          <View style={{ flex: 1 }}>
            <Stat value={formatDuration(detail.durationSecs)} label="Time" size="small" />
          </View>
          <View style={{ flex: 1 }}>
            <Stat value={String(detail.setCount)} label="Sets" size="small" />
          </View>
        </StatRow>

        <Stack gap="md">
          {detail.exercises.map((exercise) => (
            <Card key={exercise.id}>
              <Stack gap="md">
                <Text
                  variant="callout"
                  weight="semibold"
                  onPress={() => router.push(`/exercise/${exercise.exerciseId}`)}
                  accessibilityRole="link"
                >
                  {exercise.exerciseName}
                </Text>

                <Divider />

                {exercise.sets.length === 0 ? (
                  <Text tone="faint" variant="caption">
                    No sets logged
                  </Text>
                ) : (
                  exercise.sets.map((set, index) => (
                    <Row key={set.id} justify="space-between">
                      <Row gap="sm">
                        <Text variant="caption" tone="faint" style={{ width: 20 }}>
                          {index + 1}
                        </Text>
                        <Text>
                          {units.weight(set.weightKg)} × {set.reps ?? '—'}
                        </Text>
                        {SET_TYPE_BADGE[set.setType] ? (
                          <Badge label={SET_TYPE_BADGE[set.setType] ?? ''} />
                        ) : null}
                      </Row>
                      <Row gap="sm">
                        {set.rpe !== null ? (
                          <Text variant="caption" tone="muted">
                            RPE {set.rpe}
                          </Text>
                        ) : null}
                        {analyses.data?.get(set.id) ? (
                          <Pressable
                            onPress={() => router.push(`/analysis/${analyses.data.get(set.id)?.id}`)}
                            accessibilityRole="button"
                            accessibilityLabel={`Watch the video of set ${index + 1}`}
                            hitSlop={8}
                          >
                            <Text variant="caption" tone="accent">
                              ▶ video
                            </Text>
                          </Pressable>
                        ) : null}
                        {!set.isCompleted ? (
                          <Text variant="caption" tone="faint">
                            skipped
                          </Text>
                        ) : null}
                      </Row>
                    </Row>
                  ))
                )}
              </Stack>
            </Card>
          ))}
        </Stack>

        <View style={{ gap: theme.space.sm }}>
          <Button
            label={saved ? 'Saved as a routine' : 'Save as routine'}
            variant="secondary"
            disabled={saved}
            loading={createRoutine.isPending}
            onPress={() =>
              createRoutine.mutate(
                { workoutId: detail.id, name: detail.name ?? 'Repeat workout' },
                { onSuccess: () => setSaved(true) },
              )
            }
            fullWidth
          />
          {saved ? (
            <Button
              label="Go to routines"
              variant="ghost"
              onPress={() => router.push('/(tabs)/exercises')}
              fullWidth
            />
          ) : null}
        </View>
      </Stack>
    </Screen>
  );
}
