import { palette } from './palette';

// Keys = shortName from config/tournament-clubs.json (25 clubs; checked against that file, NOT against the DB).
// Hex values ESTIMATED from memory (design-system-v2.md §4): adjust them looking at each real crest on the phone.
export const CLUB_COLORS: Record<string, string> = {
  ARS: '#EF0107',
  MCI: '#6CABDD',
  MUN: '#DA291C',
  AVL: '#95BFE5',
  LIV: '#C8102E',
  BAR: '#A50044',
  RMA: '#FEBE10',
  VIL: '#FBE122',
  ATM: '#CB3524',
  BET: '#0BB363',
  INT: '#0068A8',
  NAP: '#12A0D7',
  ROM: '#F0BC42',
  COM: '#1B4F9C',
  MIL: '#FB090B',
  BAY: '#DC052D',
  BVB: '#FDE100',
  RBL: '#DD0741',
  VFB: '#E32219',
  HOF: '#1961B5',
  PSG: '#DA291C',
  LEN: '#E01B22',
  LIL: '#E01E13',
  LYO: '#0B3F9A',
  MAR: '#2FAEE0',
};

const HEX = /^#[0-9a-f]{6}$/i;
export const MIN_LUMINANCE_ON_INK = 0.1;

function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// WCAG relative luminance (0 = black, 1 = white).
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// A club colour is never used as TEXT on ink/panel without passing through here: dark colours get mixed with white.
export function readableOnInk(hex: string): string {
  if (!HEX.test(hex)) return palette.paper;
  const rgb = parseHex(hex);
  let mix = 0;
  let out = hex.toUpperCase();
  while (luminance(out) < MIN_LUMINANCE_ON_INK && mix < 1) {
    mix = Math.min(1, mix + 0.05);
    out = toHex(rgb.map((v) => v + (255 - v) * mix) as [number, number, number]);
  }
  return out;
}

// For text drawn on top of a filled club colour: whichever of paper / onSignal contrasts more.
export function textOnFill(hex: string): string {
  if (!HEX.test(hex)) return palette.paper;
  return contrastRatio(hex, palette.paper) >= contrastRatio(hex, palette.onSignal) ? palette.paper : palette.onSignal;
}

// API colour wins when present and valid (the backend already exposes it); then the static map; then a neutral line.
export function clubColor(shortName: string | null | undefined, apiColor?: string | null): string {
  if (apiColor && HEX.test(apiColor)) return apiColor.toUpperCase();
  const mapped = shortName ? CLUB_COLORS[shortName.toUpperCase()] : undefined;
  return mapped ?? palette.lineStrong;
}
