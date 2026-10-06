import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FixtureTeam, MatchDetail, MatchEvent } from '../src/api/types';
import { detailScore, sortedEvents } from '../src/features/match/detail';

const team = (participantId: string): FixtureTeam => ({ participantId, clubId: participantId, name: participantId, shortName: participantId, crestUrl: '' });
const HOME = team('h');
const AWAY = team('a');

const event = (id: string, participantId: string, minute: number, type: MatchEvent['type'] = 'GOAL', createdAt = '2026-10-05T10:00:00Z'): MatchEvent => ({
  id, matchId: 'm', participantId, playerId: 'p', playerName: 'P', type, minute, createdAt,
});

const match = (over: Partial<MatchDetail>): MatchDetail => ({
  id: 'm', round: 1, leg: 1, status: 'ACTIVE', home: HOME, away: AWAY, homeScore: null, awayScore: null,
  finishedAt: null, confirmedAt: null, resolutionNote: null, events: [], ...over,
});

describe('detailScore', () => {
  it('SCHEDULED has no score', () => {
    assert.deepEqual(detailScore(match({ status: 'SCHEDULED' })), { home: null, away: null, source: 'none' });
  });

  it('ACTIVE adds up the recorded goals and ignores cards', () => {
    const events = [event('1', 'h', 10), event('2', 'a', 20), event('3', 'h', 30), event('4', 'a', 40, 'YELLOW')];
    assert.deepEqual(detailScore(match({ status: 'ACTIVE', events })), { home: 2, away: 1, source: 'live' });
  });

  it('ACTIVE ignores a stale stored score and keeps counting goals', () => {
    assert.deepEqual(detailScore(match({ status: 'ACTIVE', homeScore: 5, awayScore: 5, events: [event('1', 'h', 3)] })), {
      home: 1,
      away: 0,
      source: 'live',
    });
  });

  it('PENDING_CONFIRMATION, CONFIRMED, DISPUTED and RESOLVED use the stored score', () => {
    for (const status of ['PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'RESOLVED'] as const) {
      assert.deepEqual(detailScore(match({ status, homeScore: 3, awayScore: 1, events: [event('1', 'h', 3)] })), {
        home: 3,
        away: 1,
        source: 'official',
      });
    }
  });

  it('falls back to the recorded goals if a finished match somehow has no stored score', () => {
    assert.deepEqual(detailScore(match({ status: 'CONFIRMED', events: [event('1', 'a', 7)] })), { home: 0, away: 1, source: 'live' });
  });
});

describe('sortedEvents', () => {
  it('orders by minute, then creation time, then id, without mutating the input', () => {
    const input = [
      event('c', 'h', 30),
      event('b', 'a', 10, 'GOAL', '2026-10-05T10:00:02Z'),
      event('a', 'h', 10, 'GOAL', '2026-10-05T10:00:01Z'),
      event('d', 'a', 10, 'GOAL', '2026-10-05T10:00:01Z'),
    ];
    const ids = sortedEvents(input).map((e) => e.id);
    assert.deepEqual(ids, ['a', 'd', 'b', 'c']);
    assert.deepEqual(input.map((e) => e.id), ['c', 'b', 'a', 'd']);
  });

  it('handles an empty list', () => {
    assert.deepEqual(sortedEvents([]), []);
  });
});
