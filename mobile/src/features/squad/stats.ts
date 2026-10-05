// Labels of the six card stats. The backend stores them as the source gave them: for goalkeepers the SAME six columns mean
// something else (pace=diving, shooting=handling, passing=kicking, dribbling=reflexes, defending=speed, physical=positioning).
import type { Player } from '../../api/types';

export type StatKey = 'pace' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical';

export interface StatRow {
  key: StatKey;
  /** 3-letter label shown on the card. */
  label: string;
  /** Full name, for screen readers. */
  name: string;
  value: number | null;
}

type Labels = Record<StatKey, { label: string; name: string }>;

// Same order as a football card: two columns of three (first column, then second column).
export const STAT_ORDER: readonly StatKey[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];

const FIELD: Labels = {
  pace: { label: 'RIT', name: 'Ritmo' },
  shooting: { label: 'TIR', name: 'Tiro' },
  passing: { label: 'PAS', name: 'Pase' },
  dribbling: { label: 'REG', name: 'Regate' },
  defending: { label: 'DEF', name: 'Defensa' },
  physical: { label: 'FIS', name: 'Físico' },
};

const KEEPER: Labels = {
  pace: { label: 'EST', name: 'Estirada' },
  shooting: { label: 'PAR', name: 'Paradas' },
  passing: { label: 'SAQ', name: 'Saque' },
  dribbling: { label: 'REF', name: 'Reflejos' },
  defending: { label: 'VEL', name: 'Velocidad' },
  physical: { label: 'COL', name: 'Colocación' },
};

export const isGoalkeeper = (position: string) => position.trim().toUpperCase() === 'GK';

/** The six rows of the card with the right labels for the position; a missing stat stays null (it is not a zero). */
export function statRows(player: Pick<Player, 'position' | StatKey>): StatRow[] {
  const labels = isGoalkeeper(player.position) ? KEEPER : FIELD;
  return STAT_ORDER.map((key) => ({ key, label: labels[key].label, name: labels[key].name, value: player[key] }));
}

/** 0..1 for a bar; null when the stat is missing. Values come as 1-99 from the server. */
export function statFill(value: number | null): number | null {
  if (value === null) return null;
  return Math.min(1, Math.max(0, value / 99));
}
