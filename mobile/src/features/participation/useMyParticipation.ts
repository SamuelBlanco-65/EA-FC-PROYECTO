import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useSessionStore } from '@/stores/sessionStore';

/** My enrolment + club. A 403 NOT_A_PARTICIPANT is the normal answer before the roulette. */
export function useMyParticipation() {
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
  return useQuery({ queryKey: queryKeys.participation, queryFn: api.myParticipation, enabled: signedIn });
}
