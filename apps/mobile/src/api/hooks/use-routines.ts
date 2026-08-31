/** Routine queries and mutations (FR-RT-01..05). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  routes,
  type Page,
  type RoutineDetail,
  type RoutineSummary,
  type SaveRoutineRequest,
} from '@fi/shared';
import { api } from '../client';
import { keys } from '../query-client';

export function useRoutines() {
  return useQuery({
    queryKey: keys.routines,
    queryFn: () => api.get<Page<RoutineSummary>>(routes.routines.list),
  });
}

export function useRoutine(id: string | undefined) {
  return useQuery({
    queryKey: keys.routine(id ?? ''),
    queryFn: () => api.get<RoutineDetail>(routes.routines.detail(id ?? '')),
    enabled: Boolean(id),
  });
}

/**
 * Create and update share one mutation because the API replaces a routine
 * wholesale — the presence of an id is the only difference.
 */
export function useSaveRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: SaveRoutineRequest & { id?: string }) =>
      id
        ? api.put<RoutineDetail>(routes.routines.detail(id), body)
        : api.post<RoutineDetail>(routes.routines.list, body),
    onSuccess: (routine) => {
      queryClient.setQueryData(keys.routine(routine.id), routine);
      void queryClient.invalidateQueries({ queryKey: keys.routines });
    },
  });
}

export function useArchiveRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(routes.routines.detail(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.routines }),
  });
}

export function useDuplicateRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RoutineDetail>(routes.routines.duplicate(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.routines }),
  });
}

/** FR-HP-03: turn a logged workout into a routine. */
export function useRoutineFromWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutId: string; name: string }) =>
      api.post<RoutineDetail>('/routines/from-workout', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.routines }),
  });
}
