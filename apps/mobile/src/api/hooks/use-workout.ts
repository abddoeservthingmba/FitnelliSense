/**
 * The live workout (FR-WK-01..12).
 *
 * Every mutation here is optimistic: the cache is updated first and the UI
 * reflects a logged set in well under 100 ms regardless of the network
 * (NFR-P-01). The server's response then replaces the optimistic copy, and a
 * failure rolls back to the exact snapshot taken before the change.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  routes,
  type AddSetRequest,
  type CompleteWorkoutResponse,
  type UpdateSetRequest,
  type WorkoutDetail,
  type WorkoutSet,
} from '@fi/shared';
import { ApiRequestError, api } from '../client';
import { keys } from '../query-client';
import { idempotencyKey, uuidv7 } from '../../lib/uuid';

/** No workout in progress is a normal state, not an error (FR-WK-02). */
export function useActiveWorkout() {
  return useQuery({
    queryKey: keys.activeWorkout,
    queryFn: async () => {
      try {
        return await api.get<WorkoutDetail>(routes.workouts.active);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: 0,
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: keys.workout(id ?? ''),
    queryFn: () => api.get<WorkoutDetail>(routes.workouts.detail(id ?? '')),
    enabled: Boolean(id),
  });
}

/** Writes the server's copy into both the active and the per-id cache entries. */
function adoptWorkout(queryClient: QueryClient, workout: WorkoutDetail): void {
  queryClient.setQueryData(keys.workout(workout.id), workout);
  if (workout.status === 'in_progress') queryClient.setQueryData(keys.activeWorkout, workout);
}

/**
 * Shared optimistic plumbing: snapshot, apply, roll back on failure, adopt the
 * server's version on success. Every workout mutation below uses it, so the
 * behaviour is identical across all of them.
 */
function optimisticWorkoutMutation<TInput>(
  queryClient: QueryClient,
  options: {
    apply: (workout: WorkoutDetail, input: TInput) => WorkoutDetail;
    send: (input: TInput) => Promise<WorkoutDetail>;
  },
) {
  return {
    mutationFn: options.send,
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: keys.activeWorkout });
      const previous = queryClient.getQueryData<WorkoutDetail | null>(keys.activeWorkout);
      if (previous) {
        queryClient.setQueryData(keys.activeWorkout, options.apply(previous, input));
      }
      return { previous };
    },
    onError: (_error: unknown, _input: TInput, context?: { previous?: WorkoutDetail | null }) => {
      // NFR-R-01: roll back to exactly what was on screen before.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(keys.activeWorkout, context.previous);
      }
    },
    onSuccess: (workout: WorkoutDetail) => adoptWorkout(queryClient, workout),
  };
}

function replaceSet(
  workout: WorkoutDetail,
  setId: string,
  update: (set: WorkoutSet) => WorkoutSet,
): WorkoutDetail {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => (set.id === setId ? update(set) : set)),
    })),
  };
}

export function useStartWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { routineId?: string | null; name?: string | null }) => {
      const id = uuidv7();
      return api.post<WorkoutDetail>(
        routes.workouts.list,
        { id, startedAt: new Date().toISOString(), ...input },
        { idempotencyKey: idempotencyKey('start-workout', id) },
      );
    },
    onSuccess: (workout) => adoptWorkout(queryClient, workout),
  });
}

export function useAddWorkoutExercise(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation(
    optimisticWorkoutMutation<{ exerciseId: string; exerciseName: string; restSecs?: number }>(
      queryClient,
      {
        apply: (workout, input) => ({
          ...workout,
          exercises: [
            ...workout.exercises,
            {
              id: `pending-${input.exerciseId}`,
              exerciseId: input.exerciseId,
              exerciseName: input.exerciseName,
              position: workout.exercises.length,
              restSecs: input.restSecs ?? null,
              notes: null,
              sets: [],
            },
          ],
        }),
        send: (input) => {
          const id = uuidv7();
          return api.post<WorkoutDetail>(
            routes.workouts.exercises(workoutId ?? ''),
            { id, exerciseId: input.exerciseId, restSecs: input.restSecs ?? null },
            { idempotencyKey: idempotencyKey('add-exercise', id) },
          );
        },
      },
    ),
  );
}

export interface NewSetInput extends Omit<AddSetRequest, 'id'> {
  workoutExerciseId: string;
}

export function useAddSet(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation(
    optimisticWorkoutMutation<NewSetInput & { id: string }>(queryClient, {
      apply: (workout, input) => ({
        ...workout,
        exercises: workout.exercises.map((exercise) =>
          exercise.id === input.workoutExerciseId
            ? {
                ...exercise,
                sets: [
                  ...exercise.sets,
                  {
                    id: input.id,
                    position: exercise.sets.length,
                    setType: input.setType,
                    weightKg: input.weightKg ?? null,
                    reps: input.reps ?? null,
                    rpe: input.rpe ?? null,
                    isCompleted: input.isCompleted,
                    completedAt: input.completedAt ?? null,
                    notes: input.notes ?? null,
                  },
                ],
              }
            : exercise,
        ),
      }),
      send: ({ workoutExerciseId, ...body }) =>
        api.post<WorkoutDetail>(
          routes.workouts.sets(workoutId ?? '', workoutExerciseId),
          body,
          { idempotencyKey: idempotencyKey('add-set', body.id) },
        ),
    }),
  );
}

export function useUpdateSet() {
  const queryClient = useQueryClient();
  return useMutation(
    optimisticWorkoutMutation<{ setId: string; patch: UpdateSetRequest }>(queryClient, {
      apply: (workout, { setId, patch }) =>
        replaceSet(workout, setId, (set) => ({
          ...set,
          ...patch,
          weightKg: patch.weightKg === undefined ? set.weightKg : (patch.weightKg ?? null),
          reps: patch.reps === undefined ? set.reps : (patch.reps ?? null),
          rpe: patch.rpe === undefined ? set.rpe : (patch.rpe ?? null),
          notes: patch.notes === undefined ? set.notes : (patch.notes ?? null),
          completedAt:
            patch.isCompleted === undefined
              ? set.completedAt
              : patch.isCompleted
                ? new Date().toISOString()
                : null,
        })),
      send: ({ setId, patch }) => api.patch<WorkoutDetail>(routes.sets.detail(setId), patch),
    }),
  );
}

export function useDeleteSet() {
  const queryClient = useQueryClient();
  return useMutation(
    optimisticWorkoutMutation<{ setId: string }>(queryClient, {
      apply: (workout, { setId }) => ({
        ...workout,
        exercises: workout.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter((set) => set.id !== setId),
        })),
      }),
      send: ({ setId }) => api.delete<WorkoutDetail>(routes.sets.detail(setId)),
    }),
  );
}

export function useRemoveWorkoutExercise(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation(
    optimisticWorkoutMutation<{ workoutExerciseId: string }>(queryClient, {
      apply: (workout, { workoutExerciseId }) => ({
        ...workout,
        exercises: workout.exercises.filter((exercise) => exercise.id !== workoutExerciseId),
      }),
      send: ({ workoutExerciseId }) =>
        api.delete<WorkoutDetail>(routes.workouts.exercise(workoutId ?? '', workoutExerciseId)),
    }),
  );
}

export function useCompleteWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workoutId: string) =>
      api.post<CompleteWorkoutResponse>(
        routes.workouts.complete(workoutId),
        { completedAt: new Date().toISOString() },
        { idempotencyKey: idempotencyKey('complete', workoutId) },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.activeWorkout, null);
      void queryClient.invalidateQueries({ queryKey: keys.workouts });
      void queryClient.invalidateQueries({ queryKey: keys.workout(result.workout.id) });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useDiscardWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workoutId: string) => api.post<{ ok: true }>(routes.workouts.discard(workoutId)),
    onSuccess: () => {
      queryClient.setQueryData(keys.activeWorkout, null);
      void queryClient.invalidateQueries({ queryKey: keys.workouts });
    },
  });
}
