import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Player } from '../src/api/types';
import { addFrame, EMPTY_STATS, fpsOf } from '../src/features/tactics/frameStats';
import { DEFAULT_FORMATION_ID, FORMATIONS, formationById } from '../src/features/tactics/formations';
import { clamp, clampToField, dragTo, round4, toNormalized, toPixels } from '../src/features/tactics/geometry';
import { benchOf, buildSlots, signature, swapPlayers, toPositions, tokenName } from '../src/features/tactics/lineup';

const FIELD = { width: 360, height: 600 };
const R = 22;

describe('geometry: pixels <-> normalized', () => {
  it('converts both ways and round-trips', () => {
    assert.deepEqual(toPixels(0.5, 0.25, FIELD), { x: 180, y: 150 });
    assert.deepEqual(toNormalized(180, 150, FIELD), { x: 0.5, y: 0.25 });
    const back = toNormalized(toPixels(0.123, 0.987, FIELD).x, toPixels(0.123, 0.987, FIELD).y, FIELD);
    assert.ok(Math.abs(back.x - 0.123) < 1e-12 && Math.abs(back.y - 0.987) < 1e-12);
  });

  it('an unmeasured field gives 0, never NaN or Infinity', () => {
    assert.deepEqual(toNormalized(50, 50, { width: 0, height: 0 }), { x: 0, y: 0 });
    assert.deepEqual(clampToField(0.4, 0.4, { width: 0, height: 0 }, R), { x: 0, y: 0 });
  });

  it('clamp keeps the value in [min, max]', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(11, 0, 10), 10);
  });
});

describe('geometry: clamp with the token radius', () => {
  it('a point well inside is not touched', () => {
    assert.deepEqual(clampToField(0.5, 0.5, FIELD, R), { x: 0.5, y: 0.5 });
  });

  it('the CENTRE stops one radius away from every edge', () => {
    const lo = clampToField(-3, -3, FIELD, R);
    assert.ok(Math.abs(lo.x * FIELD.width - R) < 1e-9);
    assert.ok(Math.abs(lo.y * FIELD.height - R) < 1e-9);
    const hi = clampToField(9, 9, FIELD, R);
    assert.ok(Math.abs(hi.x * FIELD.width - (FIELD.width - R)) < 1e-9);
    assert.ok(Math.abs(hi.y * FIELD.height - (FIELD.height - R)) < 1e-9);
  });

  it('extraBottom reserves room for the name label under the token', () => {
    const hi = clampToField(0.5, 9, FIELD, R, 18);
    assert.ok(Math.abs(hi.y * FIELD.height - (FIELD.height - R - 18)) < 1e-9);
    // The top edge is not affected by the label space.
    assert.ok(Math.abs(clampToField(0.5, -9, FIELD, R, 18).y * FIELD.height - R) < 1e-9);
  });

  it('the same radius is a larger normalized margin on a smaller field', () => {
    const small = clampToField(0, 0.5, { width: 100, height: 100 }, R);
    const big = clampToField(0, 0.5, { width: 400, height: 400 }, R);
    assert.ok(small.x > big.x);
  });

  it('a field smaller than the token pins it to the middle instead of inverting the bounds', () => {
    assert.deepEqual(clampToField(0.1, 0.9, { width: 30, height: 30 }, R), { x: 0.5, y: 0.5 });
  });

  it('always lands inside [0, 1] for any input, including wild ones', () => {
    for (const v of [-1e9, -1, 0, 0.3, 1, 7, 1e9]) {
      const p = clampToField(v, v, FIELD, R, 18);
      assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `out of range for ${v}`);
    }
  });
});

describe('geometry: dragging', () => {
  it('moves by the finger translation, converted to normalized units', () => {
    const p = dragTo({ x: 0.5, y: 0.5 }, 36, -60, FIELD, R);
    assert.ok(Math.abs(p.x - 0.6) < 1e-12 && Math.abs(p.y - 0.4) < 1e-12);
  });

  it('is always relative to the START position (not accumulated frame by frame)', () => {
    const start = { x: 0.2, y: 0.8 };
    assert.deepEqual(dragTo(start, 36, 0, FIELD, R), dragTo(start, 36, 0, FIELD, R));
    assert.deepEqual(dragTo(start, 0, 0, FIELD, R), start);
  });

  it('cannot be dragged out of the field, and coming back is possible', () => {
    const start = { x: 0.9, y: 0.5 };
    const out = dragTo(start, 500, 0, FIELD, R);
    assert.ok(Math.abs(out.x * FIELD.width - (FIELD.width - R)) < 1e-9);
    const back = dragTo(start, -36, 0, FIELD, R);
    assert.ok(Math.abs(back.x - 0.8) < 1e-12);
  });

  it('round4 keeps four decimals', () => {
    assert.equal(round4(0.123456), 0.1235);
    assert.equal(round4(0.5), 0.5);
  });
});

describe('formations', () => {
  it('there are exactly the four required', () => {
    assert.deepEqual(FORMATIONS.map((f) => f.id), ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2']);
  });

  it('each has 11 slots: 1 goalkeeper and the roles its name says', () => {
    for (const f of FORMATIONS) {
      const count = (role: string) => f.slots.filter((s) => s.role === role).length;
      const lines = f.id.split('-').map(Number);
      assert.equal(f.slots.length, 11, f.id);
      assert.equal(count('POR'), 1, f.id);
      assert.equal(count('DEF'), lines[0], f.id);
      assert.equal(count('DEL'), lines[lines.length - 1], f.id);
      assert.equal(count('MED'), lines.slice(1, -1).reduce((a, b) => a + b, 0), f.id);
    }
  });

  it('every default spot is normalized and survives the clamp unchanged on a phone-sized field', () => {
    for (const f of FORMATIONS) {
      for (const s of f.slots) {
        assert.ok(s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1, f.id);
        const c = clampToField(s.x, s.y, FIELD, R, 18);
        assert.ok(Math.abs(c.x - s.x) < 1e-9 && Math.abs(c.y - s.y) < 1e-9, `${f.id} slot ${JSON.stringify(s)} gets clamped`);
      }
    }
  });

  it('no two tokens of a formation start on the same spot', () => {
    for (const f of FORMATIONS) {
      const keys = new Set(f.slots.map((s) => `${s.x},${s.y}`));
      assert.equal(keys.size, 11, f.id);
    }
  });

  it('an unknown or missing id falls back to the default formation', () => {
    assert.equal(formationById('5-5-5').id, DEFAULT_FORMATION_ID);
    assert.equal(formationById(null).id, DEFAULT_FORMATION_ID);
    assert.equal(formationById('3-5-2').id, '3-5-2');
  });
});

const player = (id: string, position: string, rating: number | null, shirt: number | null = null, name = id): Player => ({
  id, name, position, overallRating: rating, age: 25, nationality: null, shirtNumber: shirt, photoUrl: '',
  pace: null, shooting: null, passing: null, dribbling: null, defending: null, physical: null,
});

const SQUAD: Player[] = [
  player('gk1', 'GK', 85), player('gk2', 'GK', 70),
  player('cb1', 'CB', 84), player('cb2', 'CB', 83), player('lb', 'LB', 80), player('rb', 'RB', 79), player('cb3', 'CB', 75),
  player('cm1', 'CM', 86), player('cm2', 'CM', 82), player('cdm', 'CDM', 81), player('cam', 'CAM', 88), player('rm', 'RM', 78),
  player('st1', 'ST', 90), player('lw', 'LW', 87), player('rw', 'RW', 86), player('st2', 'ST', 77),
];

describe('buildSlots', () => {
  it('fills 11 distinct players, best rated per role, goalkeeper first', () => {
    const slots = buildSlots(formationById('4-3-3'), SQUAD);
    assert.equal(slots.length, 11);
    assert.equal(new Set(slots.map((s) => s.player.id)).size, 11);
    assert.equal(slots[0].player.id, 'gk1');
    assert.deepEqual(slots.slice(1, 5).map((s) => s.player.id), ['cb1', 'cb2', 'lb', 'rb']);
    assert.deepEqual(slots.slice(8).map((s) => s.player.id), ['st1', 'lw', 'rw']);
  });

  it('uses the formation default spots', () => {
    const f = formationById('4-4-2');
    const slots = buildSlots(f, SQUAD);
    slots.forEach((s, i) => assert.deepEqual([s.x, s.y], [f.slots[i].x, f.slots[i].y]));
  });

  it('keeps the same players when the formation changes, if their roles still fit', () => {
    const first = buildSlots(formationById('4-3-3'), SQUAD);
    const second = buildSlots(formationById('4-4-2'), SQUAD, first.map((s) => s.player.id));
    const ids = (list: typeof first) => list.map((s) => s.player.id).sort();
    // 4-4-2 needs one more midfielder and one forward less: ten of the eleven stay.
    const shared = ids(first).filter((id) => ids(second).includes(id));
    assert.ok(shared.length >= 10, `only ${shared.length} players kept`);
  });

  it('a saved lineup overrides the default spot of its players', () => {
    const slots = buildSlots(formationById('4-3-3'), SQUAD, ['gk1'], [{ playerId: 'gk1', x: 0.25, y: 0.6 }]);
    assert.deepEqual([slots[0].x, slots[0].y], [0.25, 0.6]);
    assert.deepEqual([slots[1].x, slots[1].y], [formationById('4-3-3').slots[1].x, formationById('4-3-3').slots[1].y]);
  });

  it('ignores saved players that left the squad and fills the field anyway', () => {
    const slots = buildSlots(formationById('4-3-3'), SQUAD, ['ghost'], [{ playerId: 'ghost', x: 0.1, y: 0.1 }]);
    assert.equal(slots.length, 11);
    assert.ok(!slots.some((s) => s.player.id === 'ghost'));
  });

  it('with no player of a role left it takes the best free player of any role', () => {
    const noKeepers = SQUAD.filter((p) => p.position !== 'GK');
    const slots = buildSlots(formationById('4-3-3'), noKeepers);
    assert.equal(slots.length, 11);
    assert.equal(new Set(slots.map((s) => s.player.id)).size, 11);
  });

  it('a squad of fewer than 11 gives fewer tokens, never duplicates', () => {
    const slots = buildSlots(formationById('4-3-3'), SQUAD.slice(0, 4));
    assert.equal(slots.length, 4);
    assert.equal(new Set(slots.map((s) => s.player.id)).size, 4);
  });

  it('does not depend on the order of the squad and does not mutate it', () => {
    const copy = [...SQUAD];
    const a = buildSlots(formationById('3-5-2'), SQUAD).map((s) => s.player.id);
    const b = buildSlots(formationById('3-5-2'), [...SQUAD].reverse()).map((s) => s.player.id);
    assert.deepEqual(a, b);
    assert.deepEqual(SQUAD, copy);
  });

  it('unknown ratings sort last', () => {
    const squad = [player('gkA', 'GK', null), player('gkB', 'GK', 60)];
    assert.equal(buildSlots(formationById('4-3-3'), squad)[0].player.id, 'gkB');
  });
});

describe('swapPlayers / benchOf', () => {
  const byId = (id: string) => SQUAD.find((p) => p.id === id) as Player;
  const base = () => buildSlots(formationById('4-3-3'), SQUAD);

  it('the substitute takes the starter\'s slot: same role and same spot, nobody else moves', () => {
    const before = base();
    const after = swapPlayers(before, 'cb1', byId('cb3'));
    const i = before.findIndex((s) => s.player.id === 'cb1');
    assert.equal(after[i].player.id, 'cb3');
    assert.deepEqual([after[i].role, after[i].x, after[i].y], [before[i].role, before[i].x, before[i].y]);
    after.forEach((s, k) => k === i || assert.deepEqual(s, before[k]));
  });

  it('still 11 distinct players and the lineup counts as changed', () => {
    const before = base();
    const after = swapPlayers(before, 'cb1', byId('cb3'));
    assert.equal(after.length, 11);
    assert.equal(new Set(after.map((s) => s.player.id)).size, 11);
    assert.notEqual(signature('4-3-3', toPositions(after)), signature('4-3-3', toPositions(before)));
  });

  it('changes nothing if the leaving player is not a starter', () => {
    const before = base();
    assert.deepEqual(swapPlayers(before, 'gk2', byId('cb3')), before);
    assert.deepEqual(swapPlayers(before, 'nobody', byId('cb3')), before);
  });

  it('never puts a player on the field twice', () => {
    const before = base();
    assert.deepEqual(swapPlayers(before, 'cb1', byId('cb2')), before);
  });

  it('does not mutate the input', () => {
    const before = base();
    const snapshot = JSON.stringify(before);
    swapPlayers(before, 'cb1', byId('cb3'));
    assert.equal(JSON.stringify(before), snapshot);
  });

  it('the swapped player survives a formation change', () => {
    const swapped = swapPlayers(base(), 'cb1', byId('cb3'));
    const next = buildSlots(formationById('4-4-2'), SQUAD, swapped.map((s) => s.player.id));
    const ids = next.map((s) => s.player.id);
    assert.ok(ids.includes('cb3'));
    assert.ok(!ids.includes('cb1'));
  });

  it('benchOf is the rest of the squad, goalkeepers first, and excludes every starter', () => {
    const slots = base();
    const bench = benchOf(SQUAD, slots);
    const playing = new Set(slots.map((s) => s.player.id));
    assert.equal(bench.length, SQUAD.length - 11);
    assert.ok(bench.every((p) => !playing.has(p.id)));
    assert.equal(bench[0].id, 'gk2');
  });

  it('after a swap the bench has the player who left', () => {
    const after = swapPlayers(base(), 'cb1', byId('cb3'));
    const bench = benchOf(SQUAD, after).map((p) => p.id);
    assert.ok(bench.includes('cb1'));
    assert.ok(!bench.includes('cb3'));
  });

  it('an empty bench when the squad has no one else', () => {
    const slots = buildSlots(formationById('4-4-2'), SQUAD.slice(0, 11));
    assert.deepEqual(benchOf(SQUAD.slice(0, 11), slots), []);
  });
});

describe('request body and change detection', () => {
  it('toPositions rounds to 4 decimals and keeps player ids', () => {
    const slots = buildSlots(formationById('4-3-3'), SQUAD);
    slots[0] = { ...slots[0], x: 0.123456, y: 0.987654 };
    const [first] = toPositions(slots);
    assert.deepEqual(first, { playerId: 'gk1', x: 0.1235, y: 0.9877 });
  });

  it('the signature ignores order and sub-0.0001 noise but sees a real move or a formation change', () => {
    const a = [{ playerId: 'p1', x: 0.5, y: 0.5 }, { playerId: 'p2', x: 0.2, y: 0.3 }];
    const reordered = [a[1], a[0]];
    assert.equal(signature('4-3-3', a), signature('4-3-3', reordered));
    assert.equal(signature('4-3-3', a), signature('4-3-3', [{ ...a[0], x: 0.50001 }, a[1]]));
    assert.notEqual(signature('4-3-3', a), signature('4-3-3', [{ ...a[0], x: 0.51 }, a[1]]));
    assert.notEqual(signature('4-3-3', a), signature('4-4-2', a));
  });

  it('a freshly built board and its server round trip have the same signature (no phantom "unsaved")', () => {
    const slots = buildSlots(formationById('4-2-3-1'), SQUAD);
    const sent = toPositions(slots);
    const loaded = buildSlots(formationById('4-2-3-1'), SQUAD, sent.map((p) => p.playerId), sent);
    assert.equal(signature('4-2-3-1', toPositions(loaded)), signature('4-2-3-1', sent));
  });
});

describe('token labels', () => {
  it('uses the last word of the name', () => {
    assert.equal(tokenName('Rodrigo Hernández'), 'Hernández');
    assert.equal(tokenName('  Pedri  '), 'Pedri');
  });
});

describe('frame statistics', () => {
  it('60 frames of 16.67 ms are 60 FPS with no slow frame', () => {
    let s = EMPTY_STATS;
    for (let i = 0; i < 60; i++) s = addFrame(s, 1000 / 60);
    assert.ok(Math.abs(fpsOf(s) - 60) < 1e-9);
    assert.equal(s.slowFrames, 0);
  });

  it('a long frame lowers the average, is counted as slow and is remembered as the worst', () => {
    let s = EMPTY_STATS;
    for (let i = 0; i < 59; i++) s = addFrame(s, 1000 / 60);
    s = addFrame(s, 100);
    assert.equal(s.slowFrames, 1);
    assert.equal(s.worstMs, 100);
    assert.ok(fpsOf(s) < 60);
  });

  it('is pure: adding a frame does not change the previous value; empty is 0 FPS', () => {
    const before = { ...EMPTY_STATS };
    addFrame(EMPTY_STATS, 16);
    assert.deepEqual(EMPTY_STATS, before);
    assert.equal(fpsOf(EMPTY_STATS), 0);
  });
});
