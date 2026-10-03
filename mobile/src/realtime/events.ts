// Mirrors backend/app/realtime/events.py (camelCase on the wire). They only NOTIFY: the app refetches over REST.
export type EventKind = 'GOAL' | 'YELLOW' | 'RED';

interface MatchScore {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export type ServerMessage =
  | { type: 'AUTH_OK'; userId: string }
  | { type: 'PONG' }
  | { type: 'AUTH_ERROR'; code: string }
  | { type: 'RESYNC_REQUIRED' }
  | {
      type: 'MATCH_EVENT_CREATED';
      matchId: string;
      eventId: string;
      participantId: string;
      playerId: string;
      eventType: EventKind;
      minute: number;
      createdAt: string;
    }
  | ({ type: 'MATCH_RESULT_PENDING' } & MatchScore)
  | ({ type: 'MATCH_CONFIRMED' } & MatchScore)
  | ({ type: 'MATCH_DISPUTED' } & MatchScore)
  | ({ type: 'MATCH_RESOLVED' } & MatchScore)
  | { type: 'ROUND_ACTIVATED'; tournamentId: string; round: number }
  | { type: 'STANDINGS_UPDATED'; tournamentId: string; matchId: string }
  | { type: 'TOURNAMENT_STARTED'; tournamentId: string };

const KNOWN_TYPES = new Set<string>([
  'AUTH_OK',
  'PONG',
  'AUTH_ERROR',
  'RESYNC_REQUIRED',
  'MATCH_EVENT_CREATED',
  'MATCH_RESULT_PENDING',
  'MATCH_CONFIRMED',
  'MATCH_DISPUTED',
  'MATCH_RESOLVED',
  'ROUND_ACTIVATED',
  'STANDINGS_UPDATED',
  'TOURNAMENT_STARTED',
]);

/** null for anything that is not valid JSON or has an unknown type: a newer server must not crash an older app. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data.type === 'string' && KNOWN_TYPES.has(data.type) ? (data as ServerMessage) : null;
  } catch {
    return null;
  }
}
