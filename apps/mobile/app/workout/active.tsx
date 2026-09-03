/**
 * The live workout (J2, FR-WK-01..11). The screen the product is judged on.
 *
 * It orchestrates and does not render detail: each exercise is a
 * `WorkoutExerciseCard`, each set a `SetRow`, the timer a `RestTimerBar`. Every
 * write is optimistic, so nothing here ever waits on the network (NFR-P-01).
 */
import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import type { CompleteWorkoutResponse, WorkoutExercise } from '@fi/shared';
import { ApiRequestError } from '../../src/api/client';
import {
  useActiveWorkout,
  useAddSet,
  useAddWorkoutExercise,
  useCompleteWorkout,
  useDeleteSet,
  useDiscardWorkout,
  useRemoveWorkoutExercise,
  useUpdateSet,
} from '../../src/api/hooks/use-workout';
import { useMe } from '../../src/api/hooks/use-profile';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { ActionBar, Screen } from '../../src/components/Screen';
import { Rule, Stat, StatRow } from '../../src/components/Section';
import { EmptyState, LoadingState, OfflineBanner } from '../../src/components/StateViews';
import { ExercisePicker } from '../../src/features/routine/ExercisePicker';
import { RestTimerBar } from '../../src/features/workout/RestTimerBar';
import { WorkoutExerciseCard } from '../../src/features/workout/WorkoutExerciseCard';
import { WorkoutSummarySheet } from '../../src/features/workout/WorkoutSummarySheet';
import { LevelUpWindow } from '../../src/features/hunter/LevelUpWindow';
import { usePrefill } from '../../src/features/workout/use-prefill';
import { useRestTimer } from '../../src/features/workout/use-rest-timer';
import { useElapsed } from '../../src/features/workout/use-elapsed';
import { uuidv7 } from '../../src/lib/uuid';
import { formatDuration } from '../../src/lib/format';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

export default function ActiveWorkoutScreen() {
  const theme = useTheme();
  const units = useUnits();

  const active = useActiveWorkout();
  const me = useMe();
  const workout = active.data ?? null;
  const workoutId = workout?.id;

  const addExercise = useAddWorkoutExercise(workoutId);
  const addSet = useAddSet(workoutId);
  const updateSet = useUpdateSet();
  const deleteSet = useDeleteSet();
  const removeExercise = useRemoveWorkoutExercise(workoutId);
  const completeWorkout = useCompleteWorkout();
  const discardWorkout = useDiscardWorkout();

  const timer = useRestTimer();
  const elapsed = useElapsed(workout?.startedAt ?? null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [finished, setFinished] = useState<CompleteWorkoutResponse | null>(null);
  const [levelUpSeen, setLevelUpSeen] = useState(false);

  /**
   * The level-up window earns its interruption only when the session actually
   * produced one. Celebrating routine work is how this stops meaning anything.
   */
  const reward = finished?.hunter;
  const worthAnnouncing = Boolean(
    reward && (reward.leveledUp || reward.rankedUp || reward.badgesEarned.length > 0),
  );
  const showLevelUp = worthAnnouncing && !levelUpSeen;

  // Falls back to two minutes, matching the server default and onboarding.
  const defaultRestSecs = me.data?.profile.defaultRestSecs ?? 120;

  /**
   * A mutation that could not reach the server is retried by the query client,
   * so this only decides what the banner says — never whether logging carries
   * on (NFR-B-07).
   */
  const connectionProblem = [addSet, updateSet, deleteSet, addExercise]
    .map((mutation) => mutation.error)
    .find(
      (error): error is ApiRequestError => error instanceof ApiRequestError && error.isTransient,
    );

  const confirmDiscard = useCallback(() => {
    if (!workoutId) return;
    const discard = () =>
      discardWorkout.mutate(workoutId, { onSuccess: () => router.replace('/(tabs)') });

    // FR-WK-11: explicit confirmation, and it says what is lost.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Discard this workout?\n\nEvery set you logged will be deleted.')) {
        discard();
      }
      return;
    }
    Alert.alert('Discard this workout?', 'Every set you logged will be deleted.', [
      { text: 'Keep logging', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discard },
    ]);
  }, [discardWorkout, workoutId]);

  const finish = useCallback(() => {
    if (!workoutId) return;
    completeWorkout.mutate(workoutId, {
      onSuccess: (result) => {
        timer.skip();
        // The summary sheet and the level-up window both read from this.
        setLevelUpSeen(false);
        setFinished(result);
      },
    });
  }, [completeWorkout, timer, workoutId]);

  const completedSets = useMemo(
    () =>
      workout?.exercises.reduce(
        (total, exercise) => total + exercise.sets.filter((set) => set.isCompleted).length,
        0,
      ) ?? 0,
    [workout],
  );

  if (active.isLoading) return <LoadingState label="Loading your workout…" />;

  if (!workout) {
    return (
      <Screen>
        <EmptyState
          title="No workout in progress"
          body="Start one from a routine, or log a session as you go."
          actionLabel="Go to routines"
          onAction={() => router.replace('/(tabs)/exercises')}
        />
      </Screen>
    );
  }

  return (
    <>
      <Screen scroll footerSpace={finished ? 0 : 190}>
        <Stack gap="lg" style={{ paddingTop: theme.space.md }}>
          <OfflineBanner
            visible={connectionProblem !== undefined}
            reason={connectionProblem?.isUnavailable ? 'unavailable' : 'offline'}
          />

          {/* The session's two facts, set as large as they deserve. */}
          <View style={{ gap: theme.space.md }}>
            <StatRow>
              <View style={{ flex: 1 }}>
                <Stat size="large" value={formatDuration(elapsed)} label="elapsed" />
              </View>
              <View style={{ flex: 1 }}>
                <Stat
                  size="large"
                  value={String(completedSets)}
                  label="sets done"
                  tone={completedSets > 0 ? 'accent' : 'default'}
                />
              </View>
            </StatRow>
            <Rule />
          </View>

          {workout.exercises.length === 0 ? (
            <EmptyState
              title="Nothing logged yet"
              body="Add the first exercise and start putting numbers in."
              actionLabel="Add exercise"
              onAction={() => setPickerOpen(true)}
            />
          ) : (
            <Stack gap="md">
              {workout.exercises.map((exercise) => (
                <ExerciseCardWithPrefill
                  key={exercise.id}
                  exercise={exercise}
                  workoutId={workout.id}
                  routineId={workout.routineId}
                  onAddSet={(prefill) =>
                    addSet.mutate({
                      id: uuidv7(),
                      workoutExerciseId: exercise.id,
                      setType: 'normal',
                      weightKg: prefill.weightKg,
                      reps: prefill.reps,
                      isCompleted: false,
                    })
                  }
                  onUpdateSet={(setId, patch) => updateSet.mutate({ setId, patch })}
                  onCompleteSet={(setId, isCompleted) => {
                    updateSet.mutate({ setId, patch: { isCompleted } });
                    // FR-WK-07: completing a set starts the rest timer.
                    if (isCompleted) timer.start(exercise.restSecs ?? defaultRestSecs);
                  }}
                  onDeleteSet={(setId) => deleteSet.mutate({ setId })}
                  onRemove={() => removeExercise.mutate({ workoutExerciseId: exercise.id })}
                />
              ))}
            </Stack>
          )}

          <Button
            label="Add exercise"
            variant="secondary"
            onPress={() => setPickerOpen(true)}
            fullWidth
          />
        </Stack>
      </Screen>

      {!finished ? (
        <ActionBar>
          <RestTimerBar timer={timer} />
          <Button
            label="Finish workout"
            onPress={finish}
            loading={completeWorkout.isPending}
            disabled={completedSets === 0}
            size="large"
            fullWidth
            haptic
          />
          <Button label="Discard" variant="ghost" onPress={confirmDiscard} fullWidth />
        </ActionBar>
      ) : null}

      <ExercisePicker
        visible={pickerOpen}
        excludeIds={new Set(workout.exercises.map((exercise) => exercise.exerciseId))}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) =>
          addExercise.mutate({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            restSecs: defaultRestSecs,
          })
        }
      />

      <WorkoutSummarySheet
        visible={finished !== null && !showLevelUp}
        workoutId={workout.id}
        records={finished?.personalRecords ?? []}
        durationSecs={elapsed}
        setCount={completedSets}
        volumeLabel={units.volume(
          workout.exercises
            .flatMap((exercise) => exercise.sets)
            .filter((set) => set.isCompleted && set.setType !== 'warmup')
            .reduce((total, set) => total + Number(set.weightKg ?? 0) * (set.reps ?? 0), 0)
            .toFixed(2),
        )}
        onClose={() => {
          setFinished(null);
          router.replace('/(tabs)/history');
        }}
      />

      {/* The System speaks first, and only when something actually happened:
          a workout that levelled nothing goes straight to the summary. */}
      <LevelUpWindow
        visible={showLevelUp}
        reward={finished?.hunter ?? null}
        onClose={() => setLevelUpSeen(true)}
      />
    </>
  );
}

/**
 * The prefill hook needs one instance per exercise, and hooks cannot be called
 * in a loop body — so the per-exercise wiring lives in its own component.
 */
function ExerciseCardWithPrefill({
  exercise,
  workoutId,
  routineId,
  onAddSet,
  ...handlers
}: {
  exercise: WorkoutExercise;
  workoutId: string;
  routineId: string | null;
  onAddSet: (prefill: { weightKg: string | null; reps: number | null }) => void;
  onUpdateSet: (
    setId: string,
    patch: {
      weightKg?: string | null;
      reps?: number | null;
      durationSecs?: number | null;
      distanceM?: number | null;
    },
  ) => void;
  onCompleteSet: (setId: string, isCompleted: boolean) => void;
  onDeleteSet: (setId: string) => void;
  onRemove: () => void;
}) {
  const prefill = usePrefill(exercise, workoutId, routineId);

  return (
    <WorkoutExerciseCard
      exercise={exercise}
      kind={exercise.kind}
      prefill={prefill}
      onAddSet={() => onAddSet({ weightKg: prefill.weightKg, reps: prefill.reps })}
      {...handlers}
    />
  );
}
