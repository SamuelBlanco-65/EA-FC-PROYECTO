import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CLUB_COLORS,
  MIN_LUMINANCE_ON_INK,
  clubColor,
  contrastRatio,
  luminance,
  readableOnInk,
  textOnFill,
} from '../src/theme/clubColors';
import { palette } from '../src/theme/palette';

describe('luminance / contrast', () => {
  it('black is 0 and white is 1', () => {
    assert.equal(luminance('#000000'), 0);
    assert.ok(Math.abs(luminance('#FFFFFF') - 1) < 1e-9);
  });

  it('paper on ink has a very high contrast; secondary text on panel keeps ~6.9:1', () => {
    assert.ok(contrastRatio(palette.paper, palette.ink) > 15);
    const secondary = contrastRatio(palette.textSecondary, palette.panel);
    assert.ok(secondary > 6 && secondary < 8, `got ${secondary}`);
  });
});

describe('readableOnInk', () => {
  it('leaves an already light colour untouched', () => {
    assert.equal(readableOnInk('#FDE100'), '#FDE100');
  });

  it('lightens a dark colour until it passes the minimum luminance', () => {
    const out = readableOnInk('#004170');
    assert.notEqual(out, '#004170');
    assert.ok(luminance(out) >= MIN_LUMINANCE_ON_INK);
  });

  it('turns pure black into something readable and never loops forever', () => {
    assert.ok(luminance(readableOnInk('#000000')) >= MIN_LUMINANCE_ON_INK);
  });

  it('falls back to paper for an invalid hex', () => {
    assert.equal(readableOnInk('rojo'), palette.paper);
    assert.equal(readableOnInk('#FFF'), palette.paper);
  });

  it('every club colour is readable on ink after the function', () => {
    for (const [code, hex] of Object.entries(CLUB_COLORS)) {
      assert.ok(luminance(readableOnInk(hex)) >= MIN_LUMINANCE_ON_INK, code);
    }
  });
});

describe('textOnFill', () => {
  it('uses dark text on a yellow fill and light text on a dark fill', () => {
    assert.equal(textOnFill('#FDE100'), palette.onSignal);
    assert.equal(textOnFill('#0B3F9A'), palette.paper);
  });
});

describe('clubColor', () => {
  it('has the 25 tournament clubs, all valid hex', () => {
    const codes = Object.keys(CLUB_COLORS);
    assert.equal(codes.length, 25);
    for (const hex of Object.values(CLUB_COLORS)) assert.match(hex, /^#[0-9A-F]{6}$/);
  });

  it('uses the static map when the API has no colour', () => {
    assert.equal(clubColor('BAY', null), '#DC052D');
    assert.equal(clubColor('bay'), '#DC052D');
  });

  it('prefers a valid API colour over the map', () => {
    assert.equal(clubColor('BAY', '#112233'), '#112233');
  });

  it('ignores an invalid API colour', () => {
    assert.equal(clubColor('BAY', 'red'), '#DC052D');
  });

  it('falls back to lineStrong for an unknown or missing club', () => {
    assert.equal(clubColor('XXX', null), palette.lineStrong);
    assert.equal(clubColor(undefined), palette.lineStrong);
  });
});
