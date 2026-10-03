import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import type { MatchDetail, ResolveBody } from '@/api/types';
import { useSessionStore } from '@/stores/sessionStore';

const useIsAdmin = () => useSessionStore((s) => s.status === 'signedIn' && s.user?.role === 'admin');

// The WebSocket does not tell the admin that a visitor rejected a result (those messages go to the two players of
// the match), so the work queue also polls while the screen is mounted. 10 s is cheap: one small GET.
const WORK_QUEUE_POLL_MS = 10_000;

export function useAdminMatches() {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.adminMatches,
    queryFn: api.adminMatches,
    enabled,
    refetchInterval: WORK_QUEUE_POLL_MS,
  });
}

export function useAdminParticipants() {
  const enabled = useIsAdmin();
  return useQuery({ queryKey: queryKeys.adminParticipants, queryFn: api.adminParticipants, enabled });
}

/** Everything an admin action can change: the tournament, the calendar, the table and both admin lists. */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      queryKeys.tournament,
      queryKeys.fixtures,
      queryKeys.standings,
      queryKeys.adminMatches,
      queryKeys.adminParticipants,
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

// Admin actions fail visibly (no automatic retry, no waiting for the network): the server's 409 says why.
const ACTION = { retry: false, networkMode: 'always' } as const;

export function useStartTournament() {
  const refreshAll = useRefreshAll();
  return useMutation({ mutationFn: api.startTournament, onSettled: refreshAll, ...ACTION });
}

export function useActivateNextRound() {
  const refreshAll = useRefreshAll();
  return useMutation({ mutationFn: api.activateNextRound, onSettled: refreshAll, ...ACTION });
}

export function useResolveMatch(matchId: string) {
  const queryClient = useQueryClient();
  const refreshAll = useRefreshAll();
  return useMutation({
    mutationFn: (body: ResolveBody) => api.resolveMatch(matchId, body),
    onSuccess: (detail: MatchDetail) => queryClient.setQueryData(queryKeys.match(matchId), detail),
    onSettled: refreshAll,
    ...ACTION,
  });
}
