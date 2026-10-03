import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fixture, MatchEvent, MatchStatus } from '../src/api/types';
import { needsAction, parseScore, recordedGoals, roundOverview } from '../src/features/admin/derive';

const team = (id: string) => ({ participantId: id, clubId: `c-${id}`, name: id, shortName: id, crestUrl: '' });

function fixture(id: string, round: number, status: MatchStatus, leg = 1): Fixture {
  return { id, round, leg, status, home: team('a'), away: team('b'), homeScore: null, awayScore: null };
}

const goal = (participantId: string, minute: number, type: MatchEvent['type'] = 'GOAL'): MatchEvent => ({
  id: `${participantId}-${minute}-${type}`, matchId: 'm', participantId, playerId: 'p', playerName: null, type, minute,
  createdAt: '2026-10-03T00:00:00Z',
});

describe('roundOverview', () => {
  const matches = [
    fixture('1', 1, 'CONFIRMED'), fixture('2', 1, 'RESOLVED'), fixture('3', 1, 'DISPUTED'),
    fixture('4', 2, 'SCHEDULED'),
  ];

  it('counts closed matches of the active round only', () => {
    assert.deepEqual(roundOverview(matches, 1), { totalRounds: 2, currentTotal: 3, currentClosed: 2 });
  });

  it('round 0 (tournament started, nothing activated) has no current matches', () => {
    assert.deepEqual(roundOverview(matches, 0), { totalRounds: 2, currentTotal: 0, currentClosed: 0 });
  });

  it('no matches at all (DRAFT)', () => {
    assert.deepEqual(roundOverview([], 0), { totalRounds: 0, currentTotal: 0, currentClosed: 0 });
  });
});

describe('needsAction', () => {
  it('keeps only disputes and unanswered results, disputes first, then by round and leg', () => {
    const list = needsAction([
      fixture('pending-r1', 1, 'PENDING_CONFIRMATION'),
      fixture('done', 1, 'CONFIRMED'),
      fixture('dispute-r2', 2, 'DISPUTED'),
      fixture('active', 2, 'ACTIVE'),
      fixture('dispute-r1-leg2', 1, 'DISPUTED', 2),
      fixture('dispute-r1-leg1', 1, 'DISPUTED', 1),
    ]);
    assert.deepEqual(
      list.map((m) => m.id),
      ['dispute-r1-leg1', 'dispute-r1-leg2', 'dispute-r2', 'pending-r1'],
    );
  });

  it('does not mutate its input', () => {
    const input = [fixture('x', 2, 'DISPUTED'), fixture('y', 1, 'DISPUTED')];
    needsAction(input);
    assert.deepEqual(input.map((m) => m.id), ['x', 'y']);
  });
});

describe('recordedGoals', () => {
  const base = { home: team('a'), away: team('b') };

  it('counts GOAL events per side and ignores cards', () => {
    const events = [goal('a', 10), goal('a', 20), goal('b', 30), goal('a', 40, 'YELLOW'), goal('b', 50, 'RED')];
    assert.deepEqual(recordedGoals({ ...base, events }), { home: 2, away: 1 });
  });

  it('is 0-0 without events', () => {
    assert.deepEqual(recordedGoals({ ...base, events: [] }), { home: 0, away: 0 });
  });
});

describe('parseScore', () => {
  it('accepts integers 0..99', () => {
    assert.equal(parseScore('0'), 0);
    assert.equal(parseScore('7'), 7);
    assert.equal(parseScore(' 12 '), 12);
    assert.equal(parseScore('99'), 99);
  });

  it('rejects empty, decimals, negatives, letters and 3 digits', () => {
    for (const bad of ['', ' ', '1.5', '-1', 'a', '100', '1e1']) assert.equal(parseScore(bad), null, bad);
  });
});
