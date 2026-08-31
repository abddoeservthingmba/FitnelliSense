/**
 * History (FR-HP-01, FR-HP-02).
 *
 * Reverse-chronological, cursor-paginated, one row per session with the three
 * numbers that identify it: volume, duration, set count.
 */
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Row, Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/StateViews';
import { useWorkoutHistory } from '../../src/api/hooks/use-history';
import { formatDuration, formatWorkoutDate } from '../../src/lib/format';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

export default function HistoryScreen() {
  const theme = useTheme();
  const units = useUnits();
  const query = useWorkoutHistory();

  const workouts = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isLoading) return <LoadingState />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.xl }}>
        <Text variant="heading">History</Text>
      </View>

      <FlatList
        data={workouts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: theme.space.lg,
          gap: theme.space.md,
          paddingBottom: theme.space.xxl,
        }}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <EmptyState
            title="No workouts yet"
            body="Finished sessions show up here with every set you logged."
            actionLabel="Start a workout"
            onAction={() => router.push('/(tabs)/routines')}
          />
        }
        ListFooterComponent={
          query.isFetchingNextPage ? <LoadingState label="Loading more…" /> : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/workout/${item.id}`)} accessibilityLabel={`Workout on ${formatWorkoutDate(item.startedAt)}`}>
            <Stack gap="sm">
              <Row justify="space-between">
                <Text variant="callout" weight="semibold">
                  {item.name ?? 'Workout'}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatWorkoutDate(item.startedAt)}
                </Text>
              </Row>

              <Text variant="caption" tone="muted" numberOfLines={1}>
                {item.exerciseNames.length > 0 ? item.exerciseNames.join(' · ') : 'No exercises'}
              </Text>

              <Row gap="lg">
                <Metric label="Volume" value={units.volume(item.totalVolumeKg)} />
                <Metric label="Time" value={formatDuration(item.durationSecs)} />
                <Metric label="Sets" value={String(item.setCount)} />
              </Row>
            </Stack>
          </Card>
        )}
      />
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" tone="faint">
        {label}
      </Text>
      <Text variant="body" weight="semibold">
        {value}
      </Text>
    </View>
  );
}
