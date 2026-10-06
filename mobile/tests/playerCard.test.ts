import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isGoalkeeper, STAT_ORDER, statFill, statRows } from '../src/features/squad/stats';

const stats = { pace: 87, shooting: 92, passing: 71, dribbling: 80, defending: 47, physical: 89 };

describe('statRows', () => {
  it('uses the outfield labels in card order', () => {
    const rows = statRows({ position: 'ST', ...stats });
    assert.deepEqual(rows.map((r) => r.label), ['RIT', 'TIR', 'PAS', 'REG', 'DEF', 'FIS']);
    assert.deepEqual(rows.map((r) => r.value), [87, 92, 71, 80, 47, 89]);
    assert.deepEqual(rows.map((r) => r.key), [...STAT_ORDER]);
  });

  it('uses the goalkeeper meaning of the same six columns', () => {
    const rows = statRows({ position: 'GK', pace: 87, shooting: 89, passing: 78, dribbling: 90, defending: 46, physical: 90 });
    assert.deepEqual(rows.map((r) => r.label), ['EST', 'PAR', 'SAQ', 'REF', 'VEL', 'COL']);
    // same columns, same values: only the names change
    assert.deepEqual(rows.map((r) => r.value), [87, 89, 78, 90, 46, 90]);
  });

  it('keeps a missing stat as null instead of turning it into 0', () => {
    const rows = statRows({ position: 'CM', ...stats, passing: null });
    assert.equal(rows[2].value, null);
    assert.equal(rows[0].value, 87);
  });

  it('every row has a full name for screen readers', () => {
    for (const position of ['CB', 'GK']) {
      for (const r of statRows({ position, ...stats })) assert.ok(r.name.length > 3, r.label);
    }
  });
});

describe('isGoalkeeper', () => {
  it('matches GK in any case and ignores the other positions', () => {
    assert.equal(isGoalkeeper('GK'), true);
    assert.equal(isGoalkeeper('gk'), true);
    assert.equal(isGoalkeeper(' GK '), true);
    assert.equal(isGoalkeeper('CB'), false);
    assert.equal(isGoalkeeper(''), false);
  });
});

describe('statFill', () => {
  it('maps 1-99 to a 0..1 bar and clamps the edges', () => {
    assert.equal(statFill(99), 1);
    assert.equal(statFill(0), 0);
    assert.ok(Math.abs((statFill(50) as number) - 50 / 99) < 1e-9);
    assert.equal(statFill(150), 1);
    assert.equal(statFill(-5), 0);
  });

  it('returns null when the stat is missing', () => {
    assert.equal(statFill(null), null);
  });
});
