/** Training insights — FR-AI-04. Computed server-side, no model involved. */
import { useQuery } from '@tanstack/react-query';
import { routes, type InsightsWindow, type TrainingInsights } from '@fi/shared';
import { api } from '../client';

/** The device's local date. A window boundary is a local calendar fact. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useTrainingInsights(window: InsightsWindow) {
  const date = today();
  return useQuery({
    queryKey: ['insights', window, date],
    queryFn: () => api.get<TrainingInsights>(`${routes.insights}?window=${window}&today=${date}`),
    staleTime: 5 * 60 * 1000,
  });
}
