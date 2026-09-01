/** Nutrition queries — FR-NUT-01..14. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  routes,
  type CreateFoodEntryRequest,
  type CreateFoodRequest,
  type Food,
  type FoodEntry,
  type NutritionDay,
  type NutritionTargets,
  type UpdateFoodEntryRequest,
  type UpdateNutritionTargetsRequest,
} from '@fi/shared';
import { api } from '../client';

/** The device's local date. A day boundary is a local fact. */
export function localToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export const nutritionKeys = {
  day: (date: string) => ['nutrition', 'day', date] as const,
  targets: ['nutrition', 'targets'] as const,
  foodSearch: (query: string) => ['nutrition', 'foods', query] as const,
};

export function useNutritionDay(date: string) {
  return useQuery({
    queryKey: nutritionKeys.day(date),
    queryFn: () => api.get<NutritionDay>(routes.nutrition.day(date)),
    staleTime: 30_000,
  });
}

export function useNutritionTargets() {
  return useQuery({
    queryKey: nutritionKeys.targets,
    queryFn: () => api.get<NutritionTargets>(routes.nutrition.targets),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Food search.
 *
 * `enabled` on a two-character floor rather than debouncing in the component:
 * the server proxies a third party, so a keystroke-per-request would be rude to
 * Open Food Facts and slow for the user.
 */
export function useFoodSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: nutritionKeys.foodSearch(trimmed),
    queryFn: () =>
      api.get<{ items: Food[] }>(`${routes.nutrition.foodSearch}?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFoodByBarcode() {
  return useMutation({
    mutationFn: (barcode: string) =>
      api.get<Food>(routes.nutrition.foodByBarcode(encodeURIComponent(barcode))),
  });
}

/** Invalidates the day and the Hunter status, which food logging can move. */
function useDayInvalidation() {
  const queryClient = useQueryClient();
  return (date: string) => {
    void queryClient.invalidateQueries({ queryKey: nutritionKeys.day(date) });
    void queryClient.invalidateQueries({ queryKey: ['hunter'] });
  };
}

export function useLogFood() {
  const invalidate = useDayInvalidation();
  return useMutation({
    mutationFn: (input: CreateFoodEntryRequest) =>
      api.post<FoodEntry>(routes.nutrition.entries, input),
    onSuccess: (entry) => invalidate(entry.date),
  });
}

export function useUpdateFoodEntry() {
  const invalidate = useDayInvalidation();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateFoodEntryRequest }) =>
      api.patch<FoodEntry>(routes.nutrition.entry(input.id), input.patch),
    onSuccess: (entry) => invalidate(entry.date),
  });
}

export function useDeleteFoodEntry(date: string) {
  const invalidate = useDayInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(routes.nutrition.entry(id)),
    onSuccess: () => invalidate(date),
  });
}

export function useCreateCustomFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFoodRequest) =>
      api.post<Food>(routes.nutrition.customFoods, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nutrition', 'foods'] });
    },
  });
}

export function useUpdateNutritionTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNutritionTargetsRequest) =>
      api.put<NutritionTargets>(routes.nutrition.targets, input),
    onSuccess: (targets) => {
      queryClient.setQueryData(nutritionKeys.targets, targets);
      void queryClient.invalidateQueries({ queryKey: ['nutrition', 'day'] });
    },
  });
}
