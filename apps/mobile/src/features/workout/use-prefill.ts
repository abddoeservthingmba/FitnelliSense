/**
 * Prefill for a new set (FR-WK-06).
 *
 * The chain itself — previous set, then last session, then routine target — is
 * `prefillSet` in `@fi/domain`. This hook only supplies the candidates it can
 * see locally, which for a live workout is the sets already on screen, and
 * falls back to the server's answer for the other two links.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decOrNull, prefillSet } from '@fi/domain';
import type { Prefill, WorkoutExercise } from '@fi/shared';
import { api } from '../../api/client';
import { useUnits } from '../../lib/use-units';

export interface PrefillSuggestion {
  weightKg: string | null;
  reps: number | null;
  origin: Prefill['origin'];
  /** What the empty fields should show as grey hint text. */
  placeholder: { weight: string; reps: string };
}

/**
 * The server knows the last session and the routine target; the client knows
 * the set just logged. Asking the server once per exercise per workout is
 * cheap, and the local answer wins whenever there is one.
 */
function useServerPrefill(exerciseId: string, workoutId: string, routineId: string | null) {
  const params = new URLSearchParams({ exerciseId, workoutId });
  if (routineId) params.set('routineId', routineId);

  return useQuery({
    queryKey: ['prefill', exerciseId, workoutId],
    queryFn: () => api.get<Prefill>(`/workouts/prefill?${params.toString()}`),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function usePrefill(
  exercise: WorkoutExercise,
  workoutId: string,
  routineId: string | null,
): PrefillSuggestion {
  const units = useUnits();
  const server = useServerPrefill(exercise.exerciseId, workoutId, routineId);

  return useMemo(() => {
    const lastLogged = [...exercise.sets].reverse().find((set) => set.isCompleted);

    const result = prefillSet({
      previousSet: lastLogged
        ? { weightKg: decOrNull(lastLogged.weightKg), reps: lastLogged.reps }
        : null,
      lastSession: server.data
        ? { weightKg: decOrNull(server.data.weightKg), reps: server.data.reps }
        : null,
    });

    // The server already reports which link of the chain its answer came from;
    // only override that when the local previous set won.
    const origin =
      result.origin === 'previous_set' ? 'previous_set' : (server.data?.origin ?? 'empty');

    const weightKg = result.weightKg === null ? null : lastLogged?.weightKg ?? server.data?.weightKg ?? null;
    const reps = result.reps;

    return {
      weightKg,
      reps,
      origin,
      placeholder: {
        weight: weightKg === null ? units.label : units.toInput(weightKg),
        reps: reps === null ? '0' : String(reps),
      },
    };
  }, [exercise.sets, server.data, units]);
}
