/**
 * TanStack Query configuration.
 *
 * NFR-R-06 and R1: Neon's free tier suspends idle compute, so the first request
 * after a pause is slow. Cached data is shown while it revalidates, retries are
 * exponential with jitter (NFR-R-05), and a validation error is never retried.
 */
import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './client';

const MAX_RETRIES = 3;

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 8000);
  return base + Math.random() * 250; // jitter, so retries do not synchronise
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiRequestError)) return false;
  // A rejected payload or a missing row will be rejected again.
  if (error.status >= 400 && error.status < 500 && !error.isOffline) return false;
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: shouldRetry,
        retryDelay: backoffMs,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: shouldRetry,
        retryDelay: backoffMs,
      },
    },
  });
}

/** Query keys in one place, so invalidation is never a guess. */
export const keys = {
  me: ['me'] as const,
  taxonomy: ['taxonomy'] as const,
  exercises: (filters: Record<string, unknown> = {}) => ['exercises', filters] as const,
  exercise: (id: string) => ['exercise', id] as const,
  routines: ['routines'] as const,
  routine: (id: string) => ['routine', id] as const,
  workouts: ['workouts'] as const,
  workout: (id: string) => ['workout', id] as const,
  activeWorkout: ['workout', 'active'] as const,
  progressSummary: ['progress', 'summary'] as const,
  progressExercise: (id: string, metric: string) => ['progress', 'exercise', id, metric] as const,
  records: ['progress', 'records'] as const,
  media: (id: string) => ['media', id] as const,
} as const;
