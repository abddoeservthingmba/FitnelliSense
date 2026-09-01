/** Hunter System queries (levels, quests, badges, leaderboard). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BadgeCollection,
  ClaimQuestResponse,
  HunterStatus,
  Leaderboard,
  QuestBoard,
} from '@fi/shared';
import { api } from '../client';

/** The device's local date. A day boundary and a streak are local facts. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const hunterKeys = {
  status: (date: string) => ['hunter', 'status', date] as const,
  quests: (date: string) => ['hunter', 'quests', date] as const,
  badges: (date: string) => ['hunter', 'badges', date] as const,
  leaderboard: (window: string, date: string) =>
    ['hunter', 'leaderboard', window, date] as const,
} as const;

export function useHunterStatus() {
  const date = today();
  return useQuery({
    queryKey: hunterKeys.status(date),
    queryFn: () => api.get<HunterStatus>(`/hunter?today=${date}`),
    staleTime: 30_000,
  });
}

export function useQuests() {
  const date = today();
  return useQuery({
    queryKey: hunterKeys.quests(date),
    queryFn: () => api.get<QuestBoard>(`/hunter/quests?today=${date}`),
    staleTime: 30_000,
  });
}

export function useBadges() {
  const date = today();
  return useQuery({
    queryKey: hunterKeys.badges(date),
    queryFn: () => api.get<BadgeCollection>(`/hunter/badges?today=${date}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeaderboard(window: 'week' | 'month' | 'all') {
  const date = today();
  return useQuery({
    queryKey: hunterKeys.leaderboard(window, date),
    queryFn: () =>
      api.get<Leaderboard>(`/hunter/leaderboard?window=${window}&today=${date}`),
    staleTime: 60_000,
  });
}

/**
 * Collecting a quest. Not optimistic: the XP and any level change come from the
 * server, and showing a level-up that then failed to happen would be worse than
 * a moment's wait.
 */
export function useClaimQuest() {
  const queryClient = useQueryClient();
  const date = today();

  return useMutation({
    mutationFn: (questId: string) =>
      api.post<ClaimQuestResponse>(`/hunter/quests/${questId}/claim?today=${date}`),
    onSuccess: (result) => {
      queryClient.setQueryData(hunterKeys.status(date), result.status);
      void queryClient.invalidateQueries({ queryKey: hunterKeys.quests(date) });
      void queryClient.invalidateQueries({ queryKey: ['hunter', 'leaderboard'] });
    },
  });
}
