import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { LineupSlot } from '@/api/types';
import { useSessionStore } from '@/stores/sessionStore';

/** My saved lineup, or `null` when I never saved one (the server answers 404 LINEUP_NOT_FOUND: that is data, not an error). */
export function useMyLineup() {
  const enabled = useSessionStore((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: queryKeys.lineup,
    queryFn: async () => {
      try {
        return await api.lineup();
      } catch (error) {
        if (isApiError(error) && error.code === 'LINEUP_NOT_FOUND') return null;
        throw error;
      }
    },
    enabled,
  });
}

/** PUT /lineups/me replaces the previous lineup. Online only: a failed save is shown, never queued. */
export function useSaveLineup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { formation: string; positions: LineupSlot[] }) => api.saveLineup(body.formation, body.positions),
    onSuccess: (lineup) => queryClient.setQueryData(queryKeys.lineup, lineup),
    retry: false,
    networkMode: 'always',
  });
}
