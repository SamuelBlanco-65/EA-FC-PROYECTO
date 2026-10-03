// Display helpers for the match room. The SERVER decides the official score (it derives it from the GOAL events
// when the home player finishes); the live number here is the same count, only to show it before that moment.
import type { EventType, MatchDetail, MatchEvent, Player } from '@/api/types';
import type { QueuedEvent, RejectedEvent } from '@/offline/eventQueue';

export const MIN_MINUTE = 1;
export const MAX_MINUTE = 120;

export type Side = 'home' | 'away';

export function mySide(match: Pick<MatchDetail, 'home' | 'away'>, participantId: string): Side | null {
  if (match.home.participantId === participantId) return 'home';
  if (match.away.participantId === participantId) return 'away';
  return null;
}

export type EventState = 'sent' | 'pending' | 'rejected';

export interface RoomEvent {
  id: string;
  type: EventType;
  minute: number;
  participantId: string;
  playerName: string;
  createdAt: string;
  state: EventState;
  /** Why the server refused it (only when state is "rejected"). */
  reason?: string;
}

/**
 * Events as the room shows them: what the server has + what this phone still has to send (+ what the server
 * refused, so it is not lost silently). An id already on the server wins over its queued copy.
 * Newest minute first; ties by creation time.
 */
export function mergeEvents(
  server: readonly MatchEvent[],
  pending: readonly QueuedEvent[],
  rejected: readonly RejectedEvent[],
  matchId: string,
  squad: readonly Player[],
): RoomEvent[] {
  const names = new Map(squad.map((p) => [p.id, p.name]));
  const seen = new Set<string>();
  const out: RoomEvent[] = [];

  for (const e of server) {
    seen.add(e.id);
    out.push({
      id: e.id, type: e.type, minute: e.minute, participantId: e.participantId,
      playerName: e.playerName ?? names.get(e.playerId) ?? 'Jugador', createdAt: e.createdAt, state: 'sent',
    });
  }
  const local = (list: readonly QueuedEvent[], state: EventState) => {
    for (const e of list) {
      if (e.matchId !== matchId || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({
        id: e.id, type: e.type, minute: e.minute, participantId: e.participantId,
        playerName: names.get(e.playerId) ?? 'Jugador', createdAt: e.createdAt, state,
        reason: state === 'rejected' ? (e as RejectedEvent).message : undefined,
      });
    }
  };
  local(pending, 'pending');
  local(rejected, 'rejected');

  return out.sort((a, b) => b.minute - a.minute || b.createdAt.localeCompare(a.createdAt));
}

/** Goals per side. Rejected events never count: the server does not have them. */
export function liveScore(
  events: readonly RoomEvent[],
  match: Pick<MatchDetail, 'home' | 'away'>,
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.type !== 'GOAL' || e.state === 'rejected') continue;
    if (e.participantId === match.home.participantId) home += 1;
    else if (e.participantId === match.away.participantId) away += 1;
  }
  return { home, away };
}

export interface Tally {
  goals: number;
  yellows: number;
  reds: number;
}

export function tally(events: readonly RoomEvent[], participantId: string): Tally {
  const t: Tally = { goals: 0, yellows: 0, reds: 0 };
  for (const e of events) {
    if (e.participantId !== participantId || e.state === 'rejected') continue;
    if (e.type === 'GOAL') t.goals += 1;
    else if (e.type === 'YELLOW') t.yellows += 1;
    else t.reds += 1;
  }
  return t;
}

/** Starting minute of the picker: the latest one already registered in this match, else 1. */
export function lastMinute(events: readonly RoomEvent[]): number {
  return events.reduce((max, e) => (e.state === 'rejected' ? max : Math.max(max, e.minute)), MIN_MINUTE);
}

export const clampMinute = (value: number) =>
  Math.min(MAX_MINUTE, Math.max(MIN_MINUTE, Number.isFinite(value) ? Math.trunc(value) : MIN_MINUTE));

const POSITION_GROUPS: Record<string, { label: string; order: number }> = {
  GK: { label: 'POR', order: 0 },
  CB: { label: 'DEF', order: 1 }, LB: { label: 'DEF', order: 1 }, RB: { label: 'DEF', order: 1 },
  LWB: { label: 'DEF', order: 1 }, RWB: { label: 'DEF', order: 1 },
  CDM: { label: 'MED', order: 2 }, CM: { label: 'MED', order: 2 }, CAM: { label: 'MED', order: 2 },
  LM: { label: 'MED', order: 2 }, RM: { label: 'MED', order: 2 },
  ST: { label: 'DEL', order: 3 }, CF: { label: 'DEL', order: 3 }, LW: { label: 'DEL', order: 3 },
  RW: { label: 'DEL', order: 3 }, LF: { label: 'DEL', order: 3 }, RF: { label: 'DEL', order: 3 },
};

export function positionLabel(position: string): string {
  return POSITION_GROUPS[position.toUpperCase()]?.label ?? position.toUpperCase().slice(0, 3);
}

/** Goalkeepers first, then defenders, midfielders, forwards; inside a group by shirt number. */
export function sortSquad(squad: readonly Player[]): Player[] {
  const order = (p: Player) => POSITION_GROUPS[p.position.toUpperCase()]?.order ?? 9;
  return [...squad].sort(
    (a, b) => order(a) - order(b) || (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) || a.name.localeCompare(b.name),
  );
}

export const EVENT_LABEL: Record<EventType, { title: string; singular: string }> = {
  GOAL: { title: 'Gol', singular: 'gol' },
  YELLOW: { title: 'Amarilla', singular: 'tarjeta amarilla' },
  RED: { title: 'Roja', singular: 'tarjeta roja' },
};
