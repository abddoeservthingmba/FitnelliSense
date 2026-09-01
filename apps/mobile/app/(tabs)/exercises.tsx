/**
 * The exercise library (FR-EX-05, FR-EX-06, NFR-P-03, NFR-P-05).
 *
 * Search is debounced so typing does not fire a request per keystroke; filters
 * are chips over the taxonomy; the list is paginated and virtualised, never
 * rendered whole.
 */
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseSummary } from '@fi/shared';
import { useExercises, useTaxonomy, type ExerciseFilters } from '../../src/api/hooks/use-catalogue';
import { Button } from '../../src/components/Button';
import { Divider, Row } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { ExerciseThumbnail } from '../../src/components/ExerciseMedia';
import { Screen } from '../../src/components/Screen';
import { ListRow } from '../../src/components/Section';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/StateViews';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
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

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, gap: theme.space.md }}>
        <Row justify="space-between">
          <View style={{ gap: 2 }}>
            <Overline>Library</Overline>
            <Text variant="heading">Exercises</Text>
          </View>
          <Button
            label="New"
            size="small"
            variant="secondary"
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
          <Chip label="My exercises" selected={scope === 'custom'} onPress={() => setScope('custom')} />
        </Row>
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
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
          }
          ListFooterComponent={
            query.isFetchingNextPage ? <LoadingState label="Loading more…" /> : null
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={subtitleFor(item)}
              leading={
                <ExerciseThumbnail mediaId={item.primaryMediaId} name={item.name} size={44} />
              }
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
      )}
    </Screen>
  );
}
