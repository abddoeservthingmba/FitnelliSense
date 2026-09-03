/**
 * The routine builder (FR-RT-01..05).
 *
 * The whole routine is edited locally and saved in one request, which is what
 * makes reordering trivially correct: the order on screen is the order sent.
 * `/routine/new` and `/routine/:id` are the same screen — the only difference
 * is whether there is something to load.
 */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { RoutineExerciseInput } from '@fi/shared';
import { ApiRequestError } from '../../src/api/client';
import {
  useArchiveRoutine,
  useRoutine,
  useSaveRoutine,
} from '../../src/api/hooks/use-routines';
import { Button } from '../../src/components/Button';
import { Card, Divider, Row, Stack } from '../../src/components/Card';
import { ActionBar, Screen } from '../../src/components/Screen';
import { Section } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { ExercisePicker } from '../../src/features/routine/ExercisePicker';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

/** A routine entry while it is being edited, with the name for display. */
interface DraftEntry extends RoutineExerciseInput {
  exerciseName: string;
}

export default function RoutineBuilderScreen() {
  const theme = useTheme();
  const units = useUnits();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const existing = useRoutine(isNew ? undefined : id);
  const saveRoutine = useSaveRoutine();
  const archiveRoutine = useArchiveRoutine();

  const [name, setName] = useState('');
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);

  // Load once into the draft; after that the draft is the truth on this screen.
  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setEntries(
      existing.data.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        targetSets: exercise.targetSets,
        targetRepsMin: exercise.targetRepsMin,
        targetRepsMax: exercise.targetRepsMax,
        targetWeightKg: exercise.targetWeightKg,
        restSecs: exercise.restSecs,
        notes: exercise.notes,
      })),
    );
  }, [existing.data]);

  const canSave = name.trim().length > 0 && entries.length > 0 && !saveRoutine.isPending;

  const move = (index: number, direction: -1 | 1) => {
    setEntries((current) => {
      const next = [...current];
      const target = index + direction;
      const item = next[index];
      const swap = next[target];
      if (!item || !swap) return current;
      next[index] = swap;
      next[target] = item;
      return next;
    });
  };

  const patchEntry = (index: number, patch: Partial<DraftEntry>) => {
    setEntries((current) =>
      current.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
    );
  };

  const save = () => {
    if (!canSave) return;
    setError(null);
    saveRoutine.mutate(
      {
        ...(isNew ? {} : { id }),
        name: name.trim(),
        exercises: entries.map(({ exerciseName: _name, ...entry }) => entry),
      },
      {
        onSuccess: () => router.back(),
        onError: (caught) =>
          setError(
            caught instanceof ApiRequestError
              ? caught
              : new ApiRequestError('INTERNAL', 'Could not save that', 500),
          ),
      },
    );
  };

  const alreadyPicked = useMemo(
    () => new Set(entries.map((entry) => entry.exerciseId)),
    [entries],
  );

  if (!isNew && existing.isLoading) return <LoadingState />;
  if (!isNew && existing.isError) {
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  }

  return (
    <>
      <Screen scroll footerSpace={72}>
        <Stack gap="xl" style={{ paddingTop: theme.space.md }}>
          <TextField
            label="Routine name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Upper A"
            error={error?.fieldError('name')}
          />

          <Section
            title={`Exercises (${entries.length})`}
            action={{ label: 'Add', onPress: () => setPickerOpen(true) }}
          >
            {entries.length === 0 ? (
              <Card>
                <Stack gap="md">
                  <Text tone="muted">
                    Add the exercises you want, in the order you do them. Targets are optional.
                  </Text>
                  <Button
                    label="Add exercises"
                    variant="secondary"
                    onPress={() => setPickerOpen(true)}
                  />
                </Stack>
              </Card>
            ) : (
              <Stack gap="md">
                {entries.map((entry, index) => (
                  <Card key={`${entry.exerciseId}-${index}`}>
                    <Stack gap="md">
                      <Row justify="space-between">
                        <Text variant="callout" weight="semibold" style={{ flex: 1 }}>
                          {index + 1}. {entry.exerciseName}
                        </Text>
                        <Row gap="xs">
                          <Button
                            label="↑"
                            size="small"
                            variant="ghost"
                            onPress={() => move(index, -1)}
                            disabled={index === 0}
                            accessibilityHint={`Move ${entry.exerciseName} up`}
                          />
                          <Button
                            label="↓"
                            size="small"
                            variant="ghost"
                            onPress={() => move(index, 1)}
                            disabled={index === entries.length - 1}
                            accessibilityHint={`Move ${entry.exerciseName} down`}
                          />
                        </Row>
                      </Row>

                      <Divider />

                      <Row gap="sm" align="flex-end">
                        <View style={{ flex: 1 }}>
                          <TextField
                            label="Sets"
                            value={entry.targetSets === null ? '' : String(entry.targetSets ?? '')}
                            onChangeText={(value) =>
                              patchEntry(index, {
                                targetSets: value.trim() ? Number.parseInt(value, 10) : null,
                              })
                            }
                            keyboardType="number-pad"
                            inputMode="numeric"
                            placeholder="—"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextField
                            label="Reps"
                            value={
                              entry.targetRepsMin === null ? '' : String(entry.targetRepsMin ?? '')
                            }
                            onChangeText={(value) => {
                              const reps = value.trim() ? Number.parseInt(value, 10) : null;
                              patchEntry(index, { targetRepsMin: reps, targetRepsMax: reps });
                            }}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            placeholder="—"
                          />
                        </View>
                        <View style={{ flex: 1.2 }}>
                          <TextField
                            label={`Weight (${units.label})`}
                            value={units.toInput(entry.targetWeightKg ?? null)}
                            onChangeText={(value) =>
                              patchEntry(index, { targetWeightKg: units.fromInput(value) })
                            }
                            keyboardType="decimal-pad"
                            inputMode="decimal"
                            placeholder="—"
                          />
                        </View>
                      </Row>

                      <Button
                        label="Remove"
                        size="small"
                        variant="ghost"
                        onPress={() =>
                          setEntries((current) =>
                            current.filter((_item, position) => position !== index),
                          )
                        }
                      />
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}
          </Section>

          {error && error.details.length === 0 ? (
            <Text tone="danger" accessibilityRole="alert">
              {error.message}
            </Text>
          ) : null}

          {!isNew ? (
            <Button
              label="Archive routine"
              variant="danger"
              onPress={() =>
                archiveRoutine.mutate(id, { onSuccess: () => router.replace('/(tabs)/exercises') })
              }
              fullWidth
            />
          ) : null}
        </Stack>
      </Screen>

      <ActionBar>
        <Button
          label={isNew ? 'Create routine' : 'Save changes'}
          onPress={save}
          disabled={!canSave}
          loading={saveRoutine.isPending}
          size="large"
          fullWidth
        />
      </ActionBar>

      <ExercisePicker
        visible={pickerOpen}
        excludeIds={alreadyPicked}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setEntries((current) => [
            ...current,
            { exerciseId: exercise.id, exerciseName: exercise.name },
          ]);
        }}
      />
    </>
  );
}
