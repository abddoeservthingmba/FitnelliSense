/**
 * Home (J1 step 3, J3's "bench press trend in ≤3 interactions").
 *
 * The editorial reading order: the week's headline number first, because it is
 * the answer to "how am I doing"; then the single action; then the supporting
 * figures; then records. One block, one accent, everything else typography and
 * rules.
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Block, Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { ListRow, Rule, Section, Stat, StatRow } from '../../src/components/Section';
import { Overline, Text } from '../../src/components/Text';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { VerifyReminder } from '../../src/features/account/VerifyReminder';
import { TierStrip } from '../../src/features/hunter/TierStrip';
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

  if (me.isLoading || summary.isLoading) return <LoadingState label="Loading your training" />;
  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const stats = summary.data;
  const hasHistory = Boolean(stats?.lastWorkoutAt);
  const firstRoutine = routines.data?.items[0];
  const target = me.data?.profile.trainingDaysPerWeek ?? null;

  const startEmpty = () =>
    startWorkout.mutate({ routineId: null }, { onSuccess: () => router.push('/workout/active') });

  return (
    <Screen scroll>
      <Stack gap="xxl" style={{ paddingTop: theme.space.xl }}>
        <Stack gap="md">
          <Stack gap="xs">
            <Overline>{greeting()}</Overline>
            <Text variant="heading">{me.data?.profile.displayName ?? 'Welcome'}</Text>
          </Stack>
          {/* Rank and level, straight after the name. */}
          <TierStrip />
          {/* Only while unverified, and only until dismissed. */}
          <VerifyReminder />
        </Stack>

        {/* The one block on the screen: whatever the next action is. */}
        {active.data ? (
          <Block accent>
            <Stack gap="lg">
              <Overline tone="inverse">In progress</Overline>
              <Text variant="display" tone="inverse">
                {active.data.exercises.length} exercise
                {active.data.exercises.length === 1 ? '' : 's'} waiting
              </Text>
              <Button
                label="Resume workout"
                onPress={() => router.push('/workout/active')}
                size="large"
                fullWidth
                haptic
                style={{ backgroundColor: theme.colors.accentText }}
              />
            </Stack>
          </Block>
        ) : (
          <Block>
            <Stack gap="lg">
              <Overline tone="inverse">Next up</Overline>
              <Text variant="display" tone="inverse">
                {firstRoutine ? firstRoutine.name : 'Build your first routine'}
              </Text>
              {firstRoutine ? (
                <Text variant="caption" tone="inverse" style={{ opacity: 0.7 }}>
                  {firstRoutine.exerciseNames.slice(0, 4).join(' · ')}
                </Text>
              ) : (
                <Text variant="caption" tone="inverse" style={{ opacity: 0.7 }}>
                  A reusable list of exercises. Every workout then starts in two taps.
                </Text>
              )}
              <Button
                label={firstRoutine ? 'Start workout' : 'Create a routine'}
                onPress={() =>
                  firstRoutine
                    ? startWorkout.mutate(
                        { routineId: firstRoutine.id, name: firstRoutine.name },
                        { onSuccess: () => router.push('/workout/active') },
                      )
                    : router.push('/routine/new')
                }
                loading={startWorkout.isPending}
                variant="accent"
                size="large"
                fullWidth
                haptic
              />
            </Stack>
          </Block>
        )}

        {hasHistory && stats ? (
          <Section title="This week">
            <Stack gap="xl">
              <StatRow>
                <View style={{ flex: 1 }}>
                  <Stat
                    size="large"
                    value={units.volume(stats.volume7dKg).replace(/\s\w+$/, '')}
                    label={`${units.label} moved`}
                    tone="accent"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Stat
                    size="large"
                    value={
                      target === null
                        ? String(stats.workoutsThisWeek)
                        : `${stats.workoutsThisWeek}/${target}`
                    }
                    label={target === null ? 'workouts' : 'of your target'}
                  />
                </View>
              </StatRow>

              <Rule />

              <StatRow>
                <View style={{ flex: 1 }}>
                  <Stat
                    size="small"
                    value={`${stats.currentStreakDays}`}
                    label={stats.currentStreakDays === 1 ? 'day streak' : 'day streak'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Stat
                    size="small"
                    value={units.volume(stats.volume30dKg)}
                    label="30-day volume"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Stat
                    size="small"
                    value={stats.lastWorkoutAt ? formatWorkoutDate(stats.lastWorkoutAt) : '—'}
                    label="last session"
                  />
                </View>
              </StatRow>
            </Stack>
          </Section>
        ) : null}

        {stats && stats.recentRecords.length > 0 ? (
          <Section
            title="Records"
            action={{ label: 'History', onPress: () => router.push('/(tabs)/history') }}
          >
            <View>
              {stats.recentRecords.map((record, index) => (
                <View key={record.id}>
                  {index > 0 ? <Rule /> : null}
                  <ListRow
                    title={record.exerciseName}
                    subtitle={`${formatPrType(record.prType)} · ${formatWorkoutDate(record.achievedAt)}`}
                    trailing={
                      <Text variant="title" tone="accent" weight="heavy">
                        {record.prType === 'best_set_volume'
                          ? units.volume(record.value)
                          : units.weight(record.value)}
                      </Text>
                    }
                    onPress={() => router.push(`/progress/${record.exerciseId}`)}
                  />
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {!hasHistory ? (
          <Section title="Start here">
            <Stack gap="sm">
              <Button
                label="Browse exercises"
                variant="secondary"
                onPress={() => router.push('/(tabs)/exercises')}
                fullWidth
              />
              <Button label="Empty workout" variant="ghost" onPress={startEmpty} fullWidth />
            </Stack>
          </Section>
        ) : (
          <Button label="Empty workout" variant="ghost" onPress={startEmpty} fullWidth />
        )}
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
