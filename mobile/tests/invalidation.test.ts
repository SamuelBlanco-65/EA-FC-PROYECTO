import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { queryKeys } from '../src/api/queryKeys';
import type { ServerMessage } from '../src/realtime/events';
import { invalidateFor } from '../src/realtime/invalidation';

const ALL_KEYS = {
  participation: queryKeys.participation,
  tournament: queryKeys.tournament,
  standings: queryKeys.standings,
  fixtures: queryKeys.fixtures,
  squad: queryKeys.squad,
  lineup: queryKeys.lineup,
  adminMatches: queryKeys.adminMatches,
  adminParticipants: queryKeys.adminParticipants,
  matchA: queryKeys.match('a'),
  matchB: queryKeys.match('b'),
};

/** A client holding one fresh (not stale) entry per key; returns the names invalidated by `message`. */
function invalidatedBy(message: ServerMessage, reconnected = false): string[] {
  const client = new QueryClient();
  for (const key of Object.values(ALL_KEYS)) client.setQueryData(key, 1);
  invalidateFor(client, message, reconnected);
  return Object.entries(ALL_KEYS)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort();
}

describe('invalidateFor: which cached data each WebSocket notification makes stale', () => {
  it('STANDINGS_UPDATED: table, calendar, tournament and the admin work queue', () => {
    const message: ServerMessage = { type: 'STANDINGS_UPDATED', tournamentId: 't', matchId: 'm' };
    assert.deepEqual(invalidatedBy(message), ['adminMatches', 'fixtures', 'standings', 'tournament']);
  });

  it('ROUND_ACTIVATED: tournament, calendar and admin matches (not the table)', () => {
    const message: ServerMessage = { type: 'ROUND_ACTIVATED', tournamentId: 't', round: 2 };
    assert.deepEqual(invalidatedBy(message), ['adminMatches', 'fixtures', 'tournament']);
  });

  it('MATCH_EVENT_CREATED: only that match', () => {
    const message: ServerMessage = {
      type: 'MATCH_EVENT_CREATED', matchId: 'a', eventId: 'e', participantId: 'p', playerId: 'pl',
      eventType: 'GOAL', minute: 10, createdAt: '2026-10-03T00:00:00Z',
    };
    assert.deepEqual(invalidatedBy(message), ['matchA']);
  });

  it('MATCH_RESULT_PENDING: calendar and that match', () => {
    const message: ServerMessage = { type: 'MATCH_RESULT_PENDING', matchId: 'b', homeScore: 1, awayScore: 0 };
    assert.deepEqual(invalidatedBy(message), ['fixtures', 'matchB']);
  });

  it('TOURNAMENT_STARTED and RESYNC_REQUIRED: everything', () => {
    const everything = Object.keys(ALL_KEYS).sort();
    assert.deepEqual(invalidatedBy({ type: 'TOURNAMENT_STARTED', tournamentId: 't' }), everything);
    assert.deepEqual(invalidatedBy({ type: 'RESYNC_REQUIRED' }), everything);
  });

  it('AUTH_OK invalidates everything only after a RE-connection (the first one just fetched)', () => {
    assert.deepEqual(invalidatedBy({ type: 'AUTH_OK', userId: 'u' }, false), []);
    assert.deepEqual(invalidatedBy({ type: 'AUTH_OK', userId: 'u' }, true), Object.keys(ALL_KEYS).sort());
  });

  it('PONG changes nothing', () => {
    assert.deepEqual(invalidatedBy({ type: 'PONG' }), []);
  });
});

describe('a mounted table refetches by itself when STANDINGS_UPDATED arrives', () => {
  it('an active standings query calls its fetcher again; an unrelated one does not', async () => {
    const client = new QueryClient();
    let standingsCalls = 0;
    let squadCalls = 0;
    const standings = new QueryObserver(client, { queryKey: queryKeys.standings, queryFn: async () => ++standingsCalls });
    const squad = new QueryObserver(client, { queryKey: queryKeys.squad, queryFn: async () => ++squadCalls });
    const stops = [standings.subscribe(() => undefined), squad.subscribe(() => undefined)];
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(standingsCalls, 1);
    assert.equal(squadCalls, 1);

    invalidateFor(client, { type: 'STANDINGS_UPDATED', tournamentId: 't', matchId: 'm' }, false);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(standingsCalls, 2, 'the table was requested again');
    assert.equal(squadCalls, 1, 'the squad was not');
    stops.forEach((stop) => stop());
    client.clear();
  });
});
