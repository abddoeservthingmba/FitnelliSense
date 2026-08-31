/**
 * Home (J1 step 3, J3's "bench press trend in ≤3 interactions").
 *
 * Priority order, top to bottom: resume a workout in progress, start one, this
 * week's numbers, recent records. The empty state offers the two things a new
 * account can usefully do rather than an explanation of the app.
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Card, Row, Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Section, StatTile, ListRow } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { Badge } from '../../src/components/Chip';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { useActiveWorkout, useStartWorkout } from '../../src/api/hooks/use-workout';
import { useProgressSummary } from '../../src/api/hooks/use-history';
import { useMe } from '../../src/api/hooks/use-profile';
import { useRoutines } from '../../src/api/hooks/use-routines';
import { formatPrType, formatWorkoutDate } from '../../src/lib/format';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

export default function HomeScreen() {
  const theme = useTheme();
  const units = useUnits();

  const me = useMe();
  const summary = useProgressSummary();
  const active = useActiveWorkout();
  const routines = useRoutines();
  const startWorkout = useStartWorkout();

  if (me.isLoading || summary.isLoading) return <LoadingState label="Loading your training…" />;
  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const stats = summary.data;
  const hasHistory = Boolean(stats?.lastWorkoutAt);
  const firstRoutine = routines.data?.items[0];

  const startEmpty = () => {
    startWorkout.mutate(
      { routineId: null },
      { onSuccess: () => router.push('/workout/active') },
    );
  };

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.xl }}>
        <Stack gap="xs">
          <Text variant="caption" tone="muted">
            {greeting()}
          </Text>
          <Text variant="heading">{me.data?.profile.displayName ?? 'Welcome'}</Text>
        </Stack>

        {/* FR-WK-03: an in-progress workout is the first thing you see. */}
        {active.data ? (
          <Card>
            <Stack gap="md">
              <Row justify="space-between">
                <Text variant="title">Workout in progress</Text>
                <Badge label="Live" tone="accent" />
              </Row>
              <Text tone="muted">
                {active.data.exercises.length} exercise
                {active.data.exercises.length === 1 ? '' : 's'} · started{' '}
                {formatWorkoutDate(active.data.startedAt).toLowerCase()}
              </Text>
              <Button
                label="Resume workout"
                onPress={() => router.push('/workout/active')}
                size="large"
                fullWidth
                haptic
              />
            </Stack>
          </Card>
        ) : (
          <Card>
            <Stack gap="md">
              <Text variant="title">Ready to train?</Text>
              {firstRoutine ? (
                <>
                  <Text tone="muted">Pick up {firstRoutine.name}, or start something new.</Text>
                  <Button
                    label={`Start ${firstRoutine.name}`}
                    onPress={() =>
                      startWorkout.mutate(
                        { routineId: firstRoutine.id, name: firstRoutine.name },
                        { onSuccess: () => router.push('/workout/active') },
                      )
                    }
                    loading={startWorkout.isPending}
                    size="large"
                    fullWidth
                    haptic
                  />
                  <Button label="Empty workout" onPress={startEmpty} variant="ghost" fullWidth />
                </>
              ) : (
                <>
                  <Text tone="muted">
                    Build a routine to reuse, or log a session as you go.
                  </Text>
                  <Button
                    label="Create your first routine"
                    onPress={() => router.push('/routine/new')}
                    size="large"
                    fullWidth
                  />
                  <Button
                    label="Browse exercises"
                    onPress={() => router.push('/(tabs)/exercises')}
                    variant="secondary"
                    fullWidth
                  />
                  <Button label="Empty workout" onPress={startEmpty} variant="ghost" fullWidth />
                </>
              )}
            </Stack>
          </Card>
        )}

        {hasHistory && stats ? (
          <Section title="This week">
            <Row gap="sm" wrap>
              <StatTile label="Workouts" value={String(stats.workoutsThisWeek)} />
              <StatTile
                label="Streak"
                value={`${stats.currentStreakDays} day${stats.currentStreakDays === 1 ? '' : 's'}`}
              />
              <StatTile label="Volume (7d)" value={units.volume(stats.volume7dKg)} />
            </Row>
          </Section>
        ) : null}

        {stats && stats.recentRecords.length > 0 ? (
          <Section title="Recent records" action={{ label: 'History', onPress: () => router.push('/(tabs)/history') }}>
            <Card padded={false}>
              <View style={{ paddingHorizontal: theme.space.lg }}>
                {stats.recentRecords.map((record) => (
                  <ListRow
                    key={record.id}
                    title={record.exerciseName}
                    subtitle={`${formatPrType(record.prType)} · ${formatWorkoutDate(record.achievedAt)}`}
                    trailing={
                      <Text variant="callout" tone="highlight" weight="semibold">
                        {record.prType === 'best_set_volume'
                          ? units.volume(record.value)
                          : units.weight(record.value)}
                      </Text>
                    }
                    onPress={() => router.push(`/progress/${record.exerciseId}`)}
                  />
                ))}
              </View>
            </Card>
          </Section>
        ) : null}

        {stats && stats.volume30dKg !== '0.00' ? (
          <Section title="Last 30 days">
            <Row gap="sm">
              <StatTile label="Total volume" value={units.volume(stats.volume30dKg)} />
              <StatTile
                label="Last workout"
                value={stats.lastWorkoutAt ? formatWorkoutDate(stats.lastWorkoutAt) : '—'}
              />
            </Row>
          </Section>
        ) : null}
      </Stack>
    </Screen>
  );
}

function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
