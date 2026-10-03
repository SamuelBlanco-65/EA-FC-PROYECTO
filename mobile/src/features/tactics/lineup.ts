// Pure logic of the tactical board: which 11 players stand where, and what gets sent to PUT /lineups/me.
import type { LineupSlot, Player } from '../../api/types';
import { positionLabel } from '../match/derive';
import { type Formation, type Role } from './formations';
import { round4 } from './geometry';

export const LINEUP_SIZE = 11;

/** A token on the field: a squad player at a normalized position. */
export interface BoardSlot {
  player: Player;
  role: Role;
  x: number;
  y: number;
}

const roleOf = (player: Player): Role | null => {
  const label = positionLabel(player.position);
  return label === 'POR' || label === 'DEF' || label === 'MED' || label === 'DEL' ? label : null;
};

/** Best rated first (unknown rating last), then by name so the result never depends on input order. */
const byRating = (a: Player, b: Player) =>
  (b.overallRating ?? -1) - (a.overallRating ?? -1) || a.name.localeCompare(b.name);

/**
 * Fills the formation's slots with up to 11 players of `squad`.
 * - Players in `keep` (in that order) are preferred, so changing formation keeps the same eleven when it can.
 * - Each slot takes the first free player of its role; if the squad has none left for that role (e.g. 1 goalkeeper
 *   only, or a missing striker) it takes the best free player of any role, so the field is still full.
 * - `saved` positions (a lineup loaded from the server) override the formation's default spot for that player.
 */
export function buildSlots(
  formation: Formation,
  squad: readonly Player[],
  keep: readonly string[] = [],
  saved: readonly LineupSlot[] = [],
): BoardSlot[] {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const kept = keep.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined);
  const keptIds = new Set(kept.map((p) => p.id));
  const pool = [...kept, ...[...squad].filter((p) => !keptIds.has(p.id)).sort(byRating)];

  const used = new Set<string>();
  const savedById = new Map(saved.map((s) => [s.playerId, s]));
  const out: BoardSlot[] = [];

  for (const slot of formation.slots) {
    const player = pool.find((p) => !used.has(p.id) && roleOf(p) === slot.role) ?? pool.find((p) => !used.has(p.id));
    if (!player) break;
    used.add(player.id);
    const at = savedById.get(player.id);
    out.push({ player, role: slot.role, x: at?.x ?? slot.x, y: at?.y ?? slot.y });
  }
  return out;
}

/** The body of PUT /lineups/me. Rounded, so "did anything change?" is a plain string comparison. */
export function toPositions(slots: readonly BoardSlot[]): LineupSlot[] {
  return slots.map((s) => ({ playerId: s.player.id, x: round4(s.x), y: round4(s.y) }));
}

export function signature(formationId: string, positions: readonly LineupSlot[]): string {
  const sorted = [...positions].sort((a, b) => a.playerId.localeCompare(b.playerId));
  return JSON.stringify([formationId, sorted.map((p) => [p.playerId, round4(p.x), round4(p.y)])]);
}

/** Name under the token: the last word of the full name ("Rodrigo Hernández" -> "Hernández"). */
export function tokenName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 ? words[words.length - 1] : name;
}

/** Shirt number inside the token; "?" when the data has none. */
export function tokenNumber(player: Pick<Player, 'shirtNumber'>): string {
  return player.shirtNumber === null ? '?' : String(player.shirtNumber);
}
