/** Exercise library and taxonomy queries (FR-EX-01..09). */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  routes,
  type CreateExerciseRequest,
  type ExerciseDetail,
  type ExerciseSummary,
  type Page,
  type TaxonomyResponse,
} from '@fi/shared';
import { api } from '../client';
import { keys } from '../query-client';

export interface ExerciseFilters {
  q?: string;
  muscleGroupId?: number;
  equipmentId?: number;
  scope?: 'all' | 'custom' | 'system';
}

function toQueryString(filters: ExerciseFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.muscleGroupId !== undefined) params.set('muscleGroupId', String(filters.muscleGroupId));
  if (filters.equipmentId !== undefined) params.set('equipmentId', String(filters.equipmentId));
  if (filters.scope && filters.scope !== 'all') params.set('scope', filters.scope);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '30');
  return params.toString();
}

/** The taxonomy barely changes; it is fetched once and reused everywhere. */
export function useTaxonomy() {
  return useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<TaxonomyResponse>(routes.taxonomy),
    staleTime: 60 * 60 * 1000,
  });
}

/** NFR-P-05: the library is paginated, never rendered unbounded. */
export function useExercises(filters: ExerciseFilters) {
  return useInfiniteQuery({
    queryKey: keys.exercises(filters as Record<string, unknown>),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<Page<ExerciseSummary>>(
        `${routes.exercises.list}?${toQueryString(filters, pageParam)}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: keys.exercise(id ?? ''),
    queryFn: () => api.get<ExerciseDetail>(routes.exercises.detail(id ?? '')),
    enabled: Boolean(id),
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExerciseRequest) =>
      api.post<ExerciseDetail>(routes.exercises.list, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

/** FR-EX-09: archive, never delete. */
export function useArchiveExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(routes.exercises.detail(id)),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ['exercises'] });
      void queryClient.invalidateQueries({ queryKey: keys.exercise(id) });
    },
  });
}
