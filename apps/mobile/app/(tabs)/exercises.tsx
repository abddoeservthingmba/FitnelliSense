/**
 * Routines and the exercise library, one tab (FR-EX-05, FR-EX-06, FR-RT-01).
 *
 * These were two tabs. They answer the same question — "what am I training" —
 * and the bottom bar had seven items, which is more than a thumb can aim at.
 * Routines ride on top as a strip; the catalogue fills the rest.
 *
 * History moved to the top right when it left the bar. It is a destination you
 * want occasionally and always in the same place, which is exactly what a
 * header slot is for.
 *
 * Search is debounced so typing does not fire a request per keystroke; filters
 * are chips over the taxonomy; the list is paginated and virtualised, never
 * rendered whole (NFR-P-03, NFR-P-05).
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseSummary } from '@fi/shared';
import { useExercises, useTaxonomy, type ExerciseFilters } from '../../src/api/hooks/use-catalogue';
import { Button } from '../../src/components/Button';
import { Divider, Row, Stack } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { ExerciseThumbnail } from '../../src/components/ExerciseMedia';
import { Screen } from '../../src/components/Screen';
import { ListRow } from '../../src/components/Section';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/StateViews';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { RoutinesStrip } from '../../src/features/routines/RoutinesStrip';
import { useDebounced } from '../../src/lib/use-debounced';
import { useTheme } from '../../src/theme';

export default function ExercisesScreen() {
  const theme = useTheme();
  const taxonomy = useTaxonomy();

  const [search, setSearch] = useState('');
  const [muscleGroupId, setMuscleGroupId] = useState<number | undefined>(undefined);
  const [scope, setScope] = useState<'all' | 'custom'>('all');

  // NFR-P-03: one request per pause in typing, not one per character.
  const debouncedSearch = useDebounced(search, 250);

  const filters = useMemo<ExerciseFilters>(
    () => ({
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(muscleGroupId === undefined ? {} : { muscleGroupId }),
      scope,
    }),
    [debouncedSearch, muscleGroupId, scope],
  );

  const query = useExercises(filters);
  const exercises = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const muscleName = useMemo(() => {
    const byId = new Map(taxonomy.data?.muscles.map((muscle) => [muscle.id, muscle.name]) ?? []);
    return (ids: number[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((name): name is string => Boolean(name))
        .join(', ');
  }, [taxonomy.data]);

  const equipmentName = useMemo(() => {
    const byId = new Map(taxonomy.data?.equipment.map((item) => [item.id, item.name]) ?? []);
    return (id: number | null) => (id === null ? null : (byId.get(id) ?? null));
  }, [taxonomy.data]);

  const subtitleFor = (exercise: ExerciseSummary): string => {
    const parts = [muscleName(exercise.primaryMuscleIds), equipmentName(exercise.equipmentId)];
    return parts.filter((part): part is string => Boolean(part)).join(' · ');
  };

  /*
   * Passed to `ListHeaderComponent` as an ELEMENT, never as `() => <View/>`.
   * An inline arrow is a new component type on every render, so React unmounts
   * and remounts the header — which drops focus and closes the keyboard on
   * every keystroke typed into the search field below.
   */
  const header = (
    <Stack gap="lg" style={{ paddingTop: theme.space.lg, paddingBottom: theme.space.md }}>
      <Row justify="space-between">
        <View style={{ gap: 2 }}>
          <Overline>Library</Overline>
          <Text variant="heading">Exercises</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/history')}
          accessibilityRole="button"
          accessibilityLabel="Workout history"
          hitSlop={12}
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            paddingHorizontal: theme.space.sm,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text variant="callout" tone="muted">
            ◷
          </Text>
          <Text variant="micro" tone="faint">
            History
          </Text>
        </Pressable>
      </Row>

      <RoutinesStrip />

      <Stack gap="md">
        <Row justify="space-between">
          <Overline>Catalogue</Overline>
          <Button
            label="New exercise"
            size="small"
            variant="ghost"
            onPress={() => router.push('/exercise/new')}
          />
        </Row>

        <TextField
          label="Search exercises"
          labelHidden
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />

        <FlatList
          horizontal
          data={[{ id: undefined, name: 'All' }, ...(taxonomy.data?.muscleGroups ?? [])]}
          keyExtractor={(item) => String(item.id ?? 'all')}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.space.sm }}
          renderItem={({ item }) => (
            <Chip
              label={item.name}
              selected={muscleGroupId === item.id}
              onPress={() => setMuscleGroupId(item.id)}
            />
          )}
        />

        <Row gap="sm">
          <Chip label="Everything" selected={scope === 'all'} onPress={() => setScope('all')} />
          <Chip
            label="My exercises"
            selected={scope === 'custom'}
            onPress={() => setScope('custom')}
          />
        </Row>
      </Stack>
    </Stack>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={query.isLoading || query.isError ? [] : exercises}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingHorizontal: theme.space.lg,
          paddingBottom: theme.space.xxl,
        }}
        ItemSeparatorComponent={() => <Divider inset={60} />}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              title={search ? 'Nothing matched' : 'No exercises yet'}
              body={
                search
                  ? 'Try a shorter search, or create it as a custom exercise.'
                  : 'The catalogue could not be loaded.'
              }
              actionLabel={search ? 'Create custom exercise' : undefined}
              onAction={search ? () => router.push('/exercise/new') : undefined}
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? <LoadingState label="Loading more…" /> : null
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={subtitleFor(item)}
            leading={<ExerciseThumbnail mediaId={item.primaryMediaId} name={item.name} size={44} />}
            trailing={
              item.isCustom ? (
                <Text variant="caption" tone="accent">
                  Custom
                </Text>
              ) : undefined
            }
            onPress={() => router.push(`/exercise/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}
