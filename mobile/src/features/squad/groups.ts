// Pure helpers of the squad tab: grouping by line and the small text under a player's name.
import type { Player } from '../../api/types';
import { positionLabel, sortSquad } from '../match/derive';

export type SquadGroupKey = 'POR' | 'DEF' | 'MED' | 'DEL' | 'OTR';

export interface SquadGroup {
  key: SquadGroupKey;
  title: string;
  players: Player[];
}

const ORDER: readonly SquadGroupKey[] = ['POR', 'DEF', 'MED', 'DEL', 'OTR'];
const TITLES: Record<SquadGroupKey, string> = {
  POR: 'Porteros',
  DEF: 'Defensas',
  MED: 'Centrocampistas',
  DEL: 'Delanteros',
  OTR: 'Otros',
};

const keyOf = (player: Player): SquadGroupKey => {
  const label = positionLabel(player.position);
  return label === 'POR' || label === 'DEF' || label === 'MED' || label === 'DEL' ? label : 'OTR';
};

/** Goalkeepers, defenders, midfielders, forwards (and anything unknown last); empty groups are dropped. */
export function groupSquad(squad: readonly Player[]): SquadGroup[] {
  const groups = new Map<SquadGroupKey, Player[]>();
  for (const player of sortSquad(squad)) {
    const key = keyOf(player);
    groups.set(key, [...(groups.get(key) ?? []), player]);
  }
  return ORDER.filter((key) => groups.has(key)).map((key) => ({ key, title: TITLES[key], players: groups.get(key) ?? [] }));
}

/** "Alemania · 31 años"; any missing part is left out. */
export function playerSubtitle(player: Pick<Player, 'nationality' | 'age'>): string {
  return [player.nationality, player.age !== null ? `${player.age} años` : null].filter((part): part is string => !!part).join(' · ');
}
