import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/api/queryClient';

import type { ServerMessage } from './events';

/** Which cached REST data a notification makes stale. The message carries no data worth trusting: refetch. */
export function invalidateFor(queryClient: QueryClient, message: ServerMessage, reconnected: boolean): void {
  const invalidate = (...keys: readonly (readonly unknown[])[]) =>
    keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));

  switch (message.type) {
    case 'AUTH_OK':
      // First connection: screens just fetched. After a reconnection events may have been missed: refetch all.
      if (reconnected) void queryClient.invalidateQueries();
      return;
    case 'RESYNC_REQUIRED':
    case 'TOURNAMENT_STARTED':
      void queryClient.invalidateQueries();
      return;
    case 'ROUND_ACTIVATED':
      invalidate(queryKeys.tournament, queryKeys.fixtures, queryKeys.adminMatches);
      return;
    case 'STANDINGS_UPDATED':
      invalidate(queryKeys.standings, queryKeys.fixtures, queryKeys.tournament, queryKeys.adminMatches);
      return;
    case 'MATCH_RESULT_PENDING':
    case 'MATCH_CONFIRMED':
    case 'MATCH_DISPUTED':
    case 'MATCH_RESOLVED':
      invalidate(queryKeys.fixtures, queryKeys.match(message.matchId));
      return;
    case 'MATCH_EVENT_CREATED':
      invalidate(queryKeys.match(message.matchId));
      return;
    default:
      return;
  }
}
