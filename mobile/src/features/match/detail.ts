// Pure helpers of the match detail screen (read-only view of any match). No business rules: the server decides statuses and scores.
import type { MatchDetail, MatchEvent } from '../../api/types';
import { recordedGoals } from '../admin/derive';

export interface DetailScore {
  home: number | null;
  away: number | null;
  /** official = the score the server stored; live = the goals recorded so far; none = nothing to show yet. */
  source: 'official' | 'live' | 'none';
}

/**
 * SCHEDULED has no score. ACTIVE shows the goals recorded so far (the server only stores the final score when the home
 * player finishes). From PENDING_CONFIRMATION on, the stored score is the one that counts.
 */
export function detailScore(match: Pick<MatchDetail, 'status' | 'homeScore' | 'awayScore' | 'home' | 'away' | 'events'>): DetailScore {
  if (match.status === 'SCHEDULED') return { home: null, away: null, source: 'none' };
  if (match.status !== 'ACTIVE' && match.homeScore !== null && match.awayScore !== null) {
    return { home: match.homeScore, away: match.awayScore, source: 'official' };
  }
  const goals = recordedGoals(match);
  return { home: goals.home, away: goals.away, source: 'live' };
}

/** Timeline order: by minute, then by creation time, then by id so the result never depends on input order. */
export function sortedEvents(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort(
    (a, b) => a.minute - b.minute || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
