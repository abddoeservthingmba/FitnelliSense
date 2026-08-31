/**
 * The exercise picker: a searchable modal used by the routine builder and by a
 * live workout (J2 step 1 — "search, multi-select, reorder").
 *
 * It stays open after a pick so adding five exercises is five taps, not five
 * round trips through a closing sheet.
 */
import { useMemo, useState } from 'react';
import { FlatList, Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseSummary } from '@fi/shared';
import { useExercises } from '../../api/hooks/use-catalogue';
import { Button } from '../../components/Button';
import { Divider, Row } from '../../components/Card';
import { ExerciseThumbnail } from '../../components/ExerciseMedia';
import { ListRow } from '../../components/Section';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { useDebounced } from '../../lib/use-debounced';
import { useTheme } from '../../theme';

export interface ExercisePickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: ExerciseSummary) => void;
  /** Exercises already chosen, shown as added rather than hidden. */
  excludeIds?: ReadonlySet<string>;
}

export function ExercisePicker({
  visible,
  onClose,
  onPick,
  excludeIds = new Set<string>(),
}: ExercisePickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);

  const filters = useMemo(
    () => (debounced.trim() ? { q: debounced.trim() } : {}),
    [debounced],
  );
  const query = useExercises(filters);
  const exercises = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + theme.space.md,
        }}
      >
        <View style={{ paddingHorizontal: theme.space.lg, gap: theme.space.md }}>
          <Row justify="space-between">
            <Text variant="title">Add exercise</Text>
            <Button label="Done" variant="ghost" size="small" onPress={onClose} />
          </Row>
          <TextField
            label="Search"
            labelHidden
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises"
            autoFocus
            autoCorrect={false}
          />
        </View>

        {query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: theme.space.lg,
              paddingBottom: insets.bottom + theme.space.xxl,
            }}
            ItemSeparatorComponent={() => <Divider inset={56} />}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            ListEmptyComponent={
              <EmptyState title="Nothing matched" body="Try a shorter search." />
            }
            renderItem={({ item }) => {
              const added = excludeIds.has(item.id);
              return (
                <ListRow
                  title={item.name}
                  leading={
                    <ExerciseThumbnail mediaId={item.primaryMediaId} name={item.name} size={40} />
                  }
                  trailing={
                    <Text variant="label" tone={added ? 'faint' : 'accent'} weight="semibold">
                      {added ? 'Added' : 'Add'}
                    </Text>
                  }
                  onPress={added ? undefined : () => onPick(item)}
                  accessibilityLabel={added ? `${item.name}, already added` : `Add ${item.name}`}
                />
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
