/** History and progress queries (FR-HP-01, FR-HP-04, FR-HP-07). */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  routes,
  type Page,
  type PersonalRecord,
  type ProgressMetric,
  type ProgressSeriesResponse,
  type ProgressSummaryResponse,
  type WorkoutSummary,
} from '@fi/shared';
import { api } from '../client';
import { keys } from '../query-client';

export function useWorkoutHistory() {
  return useInfiniteQuery({
    queryKey: keys.workouts,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<Page<WorkoutSummary>>(
        `${routes.workouts.list}?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** The dashboard. `today` is the device's date: a streak is a local fact. */
export function useProgressSummary() {
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: [...keys.progressSummary, today],
    queryFn: () =>
      api.get<ProgressSummaryResponse>(`${routes.progress.summary}?today=${today}`),
  });
}

export function useExerciseProgress(exerciseId: string | undefined, metric: ProgressMetric) {
  return useQuery({
    queryKey: keys.progressExercise(exerciseId ?? '', metric),
    queryFn: () =>
      api.get<ProgressSeriesResponse>(
        `${routes.progress.exercise(exerciseId ?? '')}?metric=${metric}`,
      ),
    enabled: Boolean(exerciseId),
  });
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: keys.records,
    queryFn: () => api.get<{ records: PersonalRecord[] }>(routes.progress.records),
  });
}
