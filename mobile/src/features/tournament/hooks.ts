import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useSessionStore } from '@/stores/sessionStore';

function useSignedIn() {
  return useSessionStore((s) => s.status === 'signedIn');
}

export function useTournament() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: queryKeys.tournament, queryFn: api.tournament, enabled });
}

export function useStandings() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: queryKeys.standings, queryFn: api.standings, enabled });
}

export function useFixtures() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: queryKeys.fixtures, queryFn: api.fixtures, enabled });
}
