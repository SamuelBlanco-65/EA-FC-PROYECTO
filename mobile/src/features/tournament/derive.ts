// Pure display helpers over what the server already decided. No business rules: statuses and standings come from the API.
import type { Fixture, MatchStatus, StandingRow } from '@/api/types';

const CLOSED: ReadonlySet<MatchStatus> = new Set(['CONFIRMED', 'RESOLVED']);

export const isClosed = (status: MatchStatus) => CLOSED.has(status);

export function groupByRound(fixtures: Fixture[]): Map<number, Fixture[]> {
  const rounds = new Map<number, Fixture[]>();
  for (const fixture of [...fixtures].sort((a, b) => a.round - b.round || a.leg - b.leg)) {
    const list = rounds.get(fixture.round);
    if (list) list.push(fixture);
    else rounds.set(fixture.round, [fixture]);
  }
  return rounds;
}

export interface RoundSummary {
  round: number;
  matches: Fixture[];
  /** Every match of the round is CONFIRMED or RESOLVED (the same condition the server uses to allow the next round). */
  closed: boolean;
}

export function summarizeRounds(fixtures: Fixture[]): RoundSummary[] {
  return [...groupByRound(fixtures)].map(([round, matches]) => ({
    round,
    matches,
    closed: matches.every((m) => isClosed(m.status)),
  }));
}

export type RoundResult = 'W' | 'D' | 'L';

export interface RoundStep {
  round: number;
  state: 'done' | 'current' | 'upcoming';
  /** My result in that round when I played a closed match; null if it is not closed yet or I rested. */
  result: RoundResult | null;
  /** I have no match in that round (odd number of clubs: one rests each round). */
  rest: boolean;
}

/** One step per round for the home "season trail", in round order. */
export function seasonTrail(fixtures: Fixture[], participantId: string, currentRound: number): RoundStep[] {
  return summarizeRounds(fixtures)
    .sort((a, b) => a.round - b.round)
    .map(({ round, matches, closed }) => {
      const mine = matches.find((m) => isMine(m, participantId));
      let result: RoundResult | null = null;
      if (mine && isClosed(mine.status) && mine.homeScore !== null && mine.awayScore !== null) {
        const iAmHome = mine.home.participantId === participantId;
        const scored = iAmHome ? mine.homeScore : mine.awayScore;
        const conceded = iAmHome ? mine.awayScore : mine.homeScore;
        result = scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
      }
      return { round, state: closed ? 'done' : round === currentRound ? 'current' : 'upcoming', result, rest: !mine };
    });
}

/** The room is offered while there is something to do in it: record events (ACTIVE) or answer the result. */
export const canEnterRoom = (status: MatchStatus) => status === 'ACTIVE' || status === 'PENDING_CONFIRMATION';

export const isMine =(fixture: Fixture, participantId: string) =>
  fixture.home.participantId === participantId || fixture.away.participantId === participantId;

/** My earliest match that is not CONFIRMED/RESOLVED yet. */
export function myNextMatch(fixtures: Fixture[], participantId: string): Fixture | null {
  const mine = [...fixtures]
    .filter((f) => isMine(f, participantId) && !isClosed(f.status))
    .sort((a, b) => a.round - b.round || a.leg - b.leg);
  return mine[0] ?? null;
}

export const myStanding = (rows: StandingRow[], participantId: string) =>
  rows.find((r) => r.participantId === participantId) ?? null;

/** With an odd number of clubs one rests each round and has no match row: who is missing from that round. */
export function restingIn(round: Fixture[], standings: StandingRow[]): StandingRow[] {
  if (round.length === 0) return [];
  const playing = new Set(round.flatMap((m) => [m.home.participantId, m.away.participantId]));
  return standings.filter((row) => !playing.has(row.participantId));
}

export const formatDifference = (value: number) => (value > 0 ? `+${value}` : String(value));
