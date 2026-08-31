/**
 * Create a custom exercise (FR-EX-07, FR-EX-08).
 *
 * A custom exercise uses the same taxonomy as the catalogue, so it behaves
 * identically everywhere afterwards — in search, in routines, in progress.
 */
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ApiRequestError } from '../../src/api/client';
import { useCreateExercise, useTaxonomy } from '../../src/api/hooks/use-catalogue';
import { Button } from '../../src/components/Button';
import { Row, Stack } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { Screen, ActionBar } from '../../src/components/Screen';
import { Section } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { LoadingState } from '../../src/components/StateViews';
import { useTheme } from '../../src/theme';

export default function NewExerciseScreen() {
  const theme = useTheme();
  const taxonomy = useTaxonomy();
  const createExercise = useCreateExercise();

  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [primaryMuscleId, setPrimaryMuscleId] = useState<number | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);

  // Muscles grouped by their group, so the picker reads like the taxonomy does.
  const grouped = useMemo(() => {
    const groups = taxonomy.data?.muscleGroups ?? [];
    return groups.map((group) => ({
      group,
      muscles: (taxonomy.data?.muscles ?? []).filter(
        (muscle) => muscle.muscleGroupId === group.id,
      ),
    }));
  }, [taxonomy.data]);

  if (taxonomy.isLoading) return <LoadingState />;

  const canSave = name.trim().length > 0 && primaryMuscleId !== null;

  const save = () => {
    if (!canSave || primaryMuscleId === null) return;
    setError(null);
    createExercise.mutate(
      {
        name: name.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(equipmentId === null ? {} : { equipmentId }),
        isUnilateral: false,
        muscles: [{ muscleId: primaryMuscleId, role: 'primary' }],
      },
      {
        onSuccess: (created) => router.replace(`/exercise/${created.id}`),
        onError: (caught) => {
          setError(
            caught instanceof ApiRequestError
              ? caught
              : new ApiRequestError('INTERNAL', 'Could not save that', 500),
          );
        },
      },
    );
  };

  return (
    <>
      <Screen scroll footerSpace={72}>
        <Stack gap="xl" style={{ paddingTop: theme.space.md }}>
          <Text tone="muted">
            Custom exercises are visible only to you, and work everywhere the built-in ones do.
          </Text>

          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Cable Y-Raise"
            error={error?.fieldError('name')}
          />

          <Section title="Primary muscle">
            <Stack gap="md">
              {grouped.map(({ group, muscles }) => (
                <Stack gap="sm" key={group.id}>
                  <Text variant="caption" tone="faint">
                    {group.name}
                  </Text>
                  <Row gap="sm" wrap>
                    {muscles.map((muscle) => (
                      <Chip
                        key={muscle.id}
                        label={muscle.name}
                        selected={primaryMuscleId === muscle.id}
                        onPress={() => setPrimaryMuscleId(muscle.id)}
                      />
                    ))}
                  </Row>
                </Stack>
              ))}
            </Stack>
          </Section>

          <Section title="Equipment">
            <Row gap="sm" wrap>
              {(taxonomy.data?.equipment ?? []).map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  selected={equipmentId === item.id}
                  onPress={() => setEquipmentId(equipmentId === item.id ? null : item.id)}
                />
              ))}
            </Row>
          </Section>

          <TextField
            label="Instructions (optional)"
            value={instructions}
            onChangeText={setInstructions}
            multiline
            numberOfLines={4}
            placeholder="How you set up and perform it"
          />

          {error && error.details.length === 0 ? (
            <Text tone="danger" accessibilityRole="alert">
              {error.message}
            </Text>
          ) : null}
        </Stack>
      </Screen>

      <ActionBar>
        <Button
          label="Save exercise"
          onPress={save}
          disabled={!canSave}
          loading={createExercise.isPending}
          size="large"
          fullWidth
        />
      </ActionBar>
    </>
  );
}
