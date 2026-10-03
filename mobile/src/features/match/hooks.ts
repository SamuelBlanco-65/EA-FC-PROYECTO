import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { MatchDetail } from '@/api/types';
import { useSessionStore } from '@/stores/sessionStore';

const useSignedIn = () => useSessionStore((s) => s.status === 'signedIn');

export function useMatch(id: string) {
  const enabled = useSignedIn();
  return useQuery({ queryKey: queryKeys.match(id), queryFn: () => api.match(id), enabled });
}

/** My club's players: needed to pick the scorer. Cached on disk so the picker also works offline. */
export function useMySquad() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: queryKeys.squad, queryFn: api.mySquad, enabled, staleTime: 10 * 60_000 });
}

export type MatchAction = 'finish' | 'confirm' | 'reject';

const CALLS = {
  finish: api.finishMatch,
  confirm: api.confirmMatch,
  reject: api.rejectMatch,
} as const;

/** Finish / confirm / reject. Online only: the server answers with the new state of the match. */
export function useMatchAction(matchId: string, action: MatchAction) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => CALLS[action](matchId),
    onSuccess: (detail: MatchDetail) => {
      queryClient.setQueryData(queryKeys.match(matchId), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixtures });
    },
    // 409 (state changed under us) and the like: take the real state from the server, then the screen decides.
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.match(matchId) }),
    // A tap on an action must never be retried automatically, nor wait silently for the network: it fails visibly.
    retry: false,
    networkMode: 'always',
  });
}
