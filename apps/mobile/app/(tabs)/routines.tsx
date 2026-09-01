/**
 * Routines (FR-RT-01, FR-RT-04, FR-RT-05).
 *
 * A routine's row is a "start this" button first and an edit target second,
 * because starting is what happens twenty times for every edit.
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Card, Row, Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/StateViews';
import { useRoutines } from '../../src/api/hooks/use-routines';
import { useActiveWorkout, useStartWorkout } from '../../src/api/hooks/use-workout';
import { useTheme } from '../../src/theme';

export default function RoutinesScreen() {
  const theme = useTheme();
  const routines = useRoutines();
  const active = useActiveWorkout();
  const startWorkout = useStartWorkout();

  const start = (routineId: string, name: string) => {
    if (active.data) {
      // FR-WK-02: one at a time. Resuming is the honest action here.
      router.push('/workout/active');
      return;
    }
    startWorkout.mutate({ routineId, name }, { onSuccess: () => router.push('/workout/active') });
  };

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.xl }}>
        <Row justify="space-between">
          <View style={{ gap: 2 }}>
            <Overline>Templates</Overline>
            <Text variant="heading">Routines</Text>
          </View>
          <Button
            label="New"
            size="small"
            variant="secondary"
            onPress={() => router.push('/routine/new')}
          />
        </Row>

        {routines.isLoading ? (
          <LoadingState />
        ) : routines.isError ? (
          <ErrorState error={routines.error} onRetry={() => void routines.refetch()} />
        ) : routines.data && routines.data.items.length === 0 ? (
          <EmptyState
            title="No routines yet"
            body="A routine is a reusable list of exercises. Build one and every workout starts in two taps."
            actionLabel="Create a routine"
            onAction={() => router.push('/routine/new')}
          />
        ) : (
          <Stack gap="md">
            {routines.data?.items.map((routine) => (
              <Card key={routine.id}>
                <Stack gap="md">
                  <View style={{ gap: 2 }}>
                    <Text variant="title">{routine.name}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {routine.exerciseNames.length > 0
                        ? routine.exerciseNames.join(' · ')
                        : 'No exercises yet'}
                    </Text>
                  </View>

                  <Row gap="sm">
                    <Button
                      label={active.data ? 'Resume workout' : 'Start'}
                      onPress={() => start(routine.id, routine.name)}
                      loading={startWorkout.isPending}
                      haptic
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Edit"
                      variant="secondary"
                      onPress={() => router.push(`/routine/${routine.id}`)}
                    />
                  </Row>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Screen>
  );
}
