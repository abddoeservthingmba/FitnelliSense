/**
 * Routines, across the top of the exercise library (FR-RT-01, FR-RT-04).
 *
 * Routines and the catalogue answer the same question — "what am I doing
 * today" — so they now share a tab. Routines sit above because starting one is
 * the common action and browsing the catalogue is the fallback.
 *
 * A horizontal strip rather than a stacked list: it costs one row of height no
 * matter how many routines exist, which is what lets the exercise list keep the
 * screen. Each card is a "start this" button first and an edit target second,
 * because starting happens twenty times for every edit.
 */
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../components/Button';
import { Card, Row, Stack } from '../../components/Card';
import { Overline, Text } from '../../components/Text';
import { useRoutines } from '../../api/hooks/use-routines';
import { useActiveWorkout, useStartWorkout } from '../../api/hooks/use-workout';
import { useTheme } from '../../theme';

const CARD_WIDTH = 232;

export function RoutinesStrip() {
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

  const items = routines.data?.items ?? [];

  return (
    <Stack gap="sm">
      <Row justify="space-between">
        <Overline>Routines</Overline>
        <Button
          label="New routine"
          size="small"
          variant="ghost"
          onPress={() => router.push('/routine/new')}
        />
      </Row>

      {routines.isError ? (
        <Text variant="caption" tone="muted">
          Routines could not be loaded. The catalogue below still works.
        </Text>
      ) : items.length === 0 ? (
        // Not an EmptyState: this is a strip inside a working screen, and a
        // full empty-state block here would push the exercise list off-screen
        // to say something small.
        <Text variant="caption" tone="muted">
          {routines.isLoading
            ? 'Loading…'
            : 'A routine is a reusable list of exercises. Build one and every workout starts in two taps.'}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.space.md, paddingRight: theme.space.lg }}
        >
          {items.map((routine) => (
            <View key={routine.id} style={{ width: CARD_WIDTH }}>
              <Card>
                <Stack gap="md">
                  <View style={{ gap: 2 }}>
                    <Text variant="title" numberOfLines={1}>
                      {routine.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {routine.exerciseNames.length > 0
                        ? routine.exerciseNames.join(' · ')
                        : 'No exercises yet'}
                    </Text>
                  </View>

                  <Row gap="sm">
                    <Button
                      label={active.data ? 'Resume' : 'Start'}
                      size="small"
                      onPress={() => start(routine.id, routine.name)}
                      loading={startWorkout.isPending}
                      haptic
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Edit"
                      size="small"
                      variant="secondary"
                      onPress={() => router.push(`/routine/${routine.id}`)}
                    />
                  </Row>
                </Stack>
              </Card>
            </View>
          ))}
        </ScrollView>
      )}
    </Stack>
  );
}
