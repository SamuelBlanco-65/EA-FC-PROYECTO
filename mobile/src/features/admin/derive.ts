// Display helpers for the admin screens. The server decides every transition (409 with a stable code); these only
// summarise what /admin/matches already returned, to show progress and to order the work queue.
import type { Fixture, MatchDetail } from '@/api/types';
// Relative on purpose: the node test runner does not resolve the "@/" alias for runtime imports.
import { isClosed } from '../tournament/derive';

export interface RoundOverview {
  totalRounds: number;
  /** Matches of the active round (0 when no round is active yet). */
  currentTotal: number;
  currentClosed: number;
}

export function roundOverview(matches: readonly Fixture[], currentRound: number): RoundOverview {
  const inRound = matches.filter((m) => m.round === currentRound);
  return {
    totalRounds: matches.reduce((max, m) => Math.max(max, m.round), 0),
    currentTotal: inRound.length,
    currentClosed: inRound.filter((m) => isClosed(m.status)).length,
  };
}

/** Matches waiting for the admin: disputes first, then results the visitor has not answered; oldest round first. */
export function needsAction(matches: readonly Fixture[]): Fixture[] {
  const rank = (m: Fixture) => (m.status === 'DISPUTED' ? 0 : 1);
  return matches
    .filter((m) => m.status === 'DISPUTED' || m.status === 'PENDING_CONFIRMATION')
    .sort((a, b) => rank(a) - rank(b) || a.round - b.round || a.leg - b.leg);
}

/** Goals recorded per side: the number the server derives when the home player finishes. */
export function recordedGoals(match: Pick<MatchDetail, 'home' | 'away' | 'events'>): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of match.events) {
    if (e.type !== 'GOAL') continue;
    if (e.participantId === match.home.participantId) home += 1;
    else if (e.participantId === match.away.participantId) away += 1;
  }
  return { home, away };
}

export const MAX_SCORE = 99;

/** The text of a score box as an integer 0..99, or null if it is empty or not a plain integer. */
export function parseScore(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  return Number(text.trim());
}
