import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fixture, MatchStatus } from '../src/api/types';
import { seasonTrail } from '../src/features/tournament/derive';

const team = (id: string) => ({ participantId: id, clubId: `c-${id}`, name: id, shortName: id, crestUrl: '' });

function fx(round: number, status: MatchStatus, home: string, away: string, hs: number | null = null, as: number | null = null): Fixture {
  return { id: `${round}-${home}-${away}`, round, leg: 1, status, home: team(home), away: team(away), homeScore: hs, awayScore: as };
}

describe('seasonTrail', () => {
  const fixtures = [
    fx(1, 'CONFIRMED', 'me', 'x', 2, 1),
    fx(1, 'CONFIRMED', 'y', 'z', 0, 0),
    fx(2, 'RESOLVED', 'x', 'me', 1, 1),
    fx(2, 'CONFIRMED', 'y', 'z', 3, 0),
    fx(3, 'CONFIRMED', 'z', 'me', 2, 0),
    fx(3, 'CONFIRMED', 'x', 'y', 1, 0),
    fx(4, 'ACTIVE', 'me', 'y'),
    fx(4, 'ACTIVE', 'x', 'z'),
    fx(5, 'SCHEDULED', 'y', 'x'),
    fx(5, 'SCHEDULED', 'me', 'z'),
  ];

  it('marks closed rounds done, the active one current and the rest upcoming', () => {
    assert.deepEqual(seasonTrail(fixtures, 'me', 4).map((s) => s.state), ['done', 'done', 'done', 'current', 'upcoming']);
  });

  it('gives my result from my side, home or away', () => {
    assert.deepEqual(seasonTrail(fixtures, 'me', 4).map((s) => s.result), ['W', 'D', 'L', null, null]);
  });

  it('flags a round without a match of mine as a rest', () => {
    const rested = fixtures.filter((f) => !(f.round === 2 && (f.home.participantId === 'me' || f.away.participantId === 'me')));
    const steps = seasonTrail(rested, 'me', 4);
    assert.equal(steps[1].rest, true);
    assert.equal(steps[1].result, null);
    assert.equal(steps[0].rest, false);
  });

  it('does not depend on the order of the fixtures', () => {
    const shuffled = [...fixtures].reverse();
    assert.deepEqual(seasonTrail(shuffled, 'me', 4).map((s) => s.round), [1, 2, 3, 4, 5]);
  });

  it('has no steps before the tournament starts', () => {
    assert.deepEqual(seasonTrail([], 'me', 0), []);
  });
});
