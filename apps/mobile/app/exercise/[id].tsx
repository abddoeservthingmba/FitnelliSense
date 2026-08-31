/**
 * Exercise detail (J1 step 5, FR-EX-02, FR-EX-04, FR-MED-07).
 *
 * The instructions are the substance: v1 ships without demonstration media, so
 * the text has to carry the page, and the media slot degrades to a labelled
 * placeholder rather than an empty frame.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Row, Stack } from '../../src/components/Card';
import { Badge } from '../../src/components/Chip';
import { ExerciseHero } from '../../src/components/ExerciseMedia';
import { Screen } from '../../src/components/Screen';
import { Section } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { useExercise, useTaxonomy } from '../../src/api/hooks/use-catalogue';
import { useActiveWorkout, useAddWorkoutExercise } from '../../src/api/hooks/use-workout';
import { useTheme } from '../../src/theme';

export default function ExerciseDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const exercise = useExercise(id);
  const taxonomy = useTaxonomy();
  const active = useActiveWorkout();
  const addExercise = useAddWorkoutExercise(active.data?.id);

  if (exercise.isLoading) return <LoadingState />;
  if (exercise.isError || !exercise.data) {
    return <ErrorState error={exercise.error} onRetry={() => void exercise.refetch()} />;
  }

  const detail = exercise.data;
  const musclesById = new Map(taxonomy.data?.muscles.map((muscle) => [muscle.id, muscle]) ?? []);
  const equipment = taxonomy.data?.equipment.find((item) => item.id === detail.equipmentId);

  const named = (role: 'primary' | 'secondary') =>
    detail.muscles
      .filter((muscle) => muscle.role === role)
      .map((muscle) => musclesById.get(muscle.muscleId)?.name)
      .filter((name): name is string => Boolean(name));

  const alreadyInWorkout = active.data?.exercises.some(
    (item) => item.exerciseId === detail.id,
  );

  return (
    <Screen scroll footerSpace={80}>
      <Stack gap="xl" style={{ paddingTop: theme.space.md }}>
        <Stack gap="sm">
          <Text variant="heading">{detail.name}</Text>
          <Row gap="sm" wrap>
            {equipment ? <Badge label={equipment.name} /> : null}
            {detail.isUnilateral ? <Badge label="One side at a time" /> : null}
            {detail.isCustom ? <Badge label="Custom" tone="accent" /> : null}
            {detail.archivedAt ? <Badge label="Archived" tone="danger" /> : null}
          </Row>
        </Stack>

        <ExerciseHero mediaId={detail.primaryMediaId} name={detail.name} />

        {detail.instructions ? (
          <Section title="How to do it">
            <Card>
              <Text style={{ lineHeight: 24 }}>{detail.instructions}</Text>
            </Card>
          </Section>
        ) : null}

        <Section title="Muscles worked">
          <Card>
            <Stack gap="md">
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Primary
                </Text>
                <Text>{named('primary').join(', ') || '—'}</Text>
              </View>
              {named('secondary').length > 0 ? (
                <View style={{ gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    Secondary
                  </Text>
                  <Text tone="muted">{named('secondary').join(', ')}</Text>
                </View>
              ) : null}
            </Stack>
          </Card>
        </Section>

        <Stack gap="sm">
          <Button
            label="View progress"
            variant="secondary"
            onPress={() => router.push(`/progress/${detail.id}`)}
            fullWidth
          />
          {active.data ? (
            <Button
              label={alreadyInWorkout ? 'Already in this workout' : 'Add to current workout'}
              onPress={() =>
                addExercise.mutate(
                  { exerciseId: detail.id, exerciseName: detail.name },
                  { onSuccess: () => router.push('/workout/active') },
                )
              }
              disabled={alreadyInWorkout}
              loading={addExercise.isPending}
              fullWidth
              haptic
            />
          ) : null}
          {detail.isCustom && !detail.archivedAt ? (
            <Button
              label="Edit this exercise"
              variant="ghost"
              onPress={() => router.push({ pathname: '/exercise/new', params: { id: detail.id } })}
              fullWidth
            />
          ) : null}
        </Stack>
      </Stack>
    </Screen>
  );
}
