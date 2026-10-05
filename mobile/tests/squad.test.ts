import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Player } from '../src/api/types';
import { groupSquad, playerSubtitle } from '../src/features/squad/groups';

const player = (name: string, position: string, shirt: number | null, over: Partial<Player> = {}): Player => ({
  id: name, name, position, overallRating: 80, age: 25, nationality: 'España', shirtNumber: shirt, photoUrl: '', ...over,
});

describe('groupSquad', () => {
  const squad = [
    player('Delantero', 'ST', 9),
    player('Medio', 'CM', 8),
    player('Portero', 'GK', 1),
    player('Central', 'CB', 4),
    player('Lateral', 'LB', 3),
    player('Extremo', 'RW', 7),
  ];

  it('orders the groups GK, DEF, MID, FWD and puts the right players in each', () => {
    const groups = groupSquad(squad);
    assert.deepEqual(groups.map((g) => g.key), ['POR', 'DEF', 'MED', 'DEL']);
    assert.deepEqual(groups.map((g) => g.title), ['Porteros', 'Defensas', 'Centrocampistas', 'Delanteros']);
    assert.deepEqual(groups[1].players.map((p) => p.name), ['Lateral', 'Central']);
    assert.deepEqual(groups[3].players.map((p) => p.name), ['Extremo', 'Delantero']);
  });

  it('orders inside a group by shirt number and does not depend on the input order', () => {
    const forward = groupSquad([...squad].reverse());
    assert.deepEqual(forward.map((g) => g.key), ['POR', 'DEF', 'MED', 'DEL']);
    assert.deepEqual(forward[1].players.map((p) => p.shirtNumber), [3, 4]);
  });

  it('drops empty groups and puts unknown positions last', () => {
    const groups = groupSquad([player('Raro', 'XYZ', 99), player('Portero', 'GK', 1)]);
    assert.deepEqual(groups.map((g) => g.key), ['POR', 'OTR']);
  });

  it('does not mutate its input and handles an empty squad', () => {
    const copy = [...squad];
    groupSquad(squad);
    assert.deepEqual(squad, copy);
    assert.deepEqual(groupSquad([]), []);
  });
});

describe('playerSubtitle', () => {
  it('joins nationality and age', () => {
    assert.equal(playerSubtitle({ nationality: 'Alemania', age: 31 }), 'Alemania · 31 años');
  });

  it('leaves out whatever is missing', () => {
    assert.equal(playerSubtitle({ nationality: null, age: 22 }), '22 años');
    assert.equal(playerSubtitle({ nationality: 'Francia', age: null }), 'Francia');
    assert.equal(playerSubtitle({ nationality: null, age: null }), '');
  });
});
