/** Profile queries (FR-AUTH-07, FR-AUTH-09, FR-AUTH-10). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { routes, type MeResponse, type UpdateProfileRequest } from '@fi/shared';
import { api } from '../client';
import { keys } from '../query-client';

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api.get<MeResponse>(routes.me.root),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProfileRequest) => api.patch<MeResponse>(routes.me.root, patch),
    onSuccess: (me) => {
      queryClient.setQueryData(keys.me, me);
      // Units changed means every weight on screen is now formatted wrongly.
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** FR-AUTH-10. The caller signs out afterwards; the session is already void. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api.delete<{ ok: true }>(routes.me.root),
  });
}
