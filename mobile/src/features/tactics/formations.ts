// The four formations as data. Slot order matters: goalkeeper first, then defence -> attack, left -> right.
// Roles use the same labels as the squad list (POR/DEF/MED/DEL, see match/derive.ts positionLabel).
// Own goal at the bottom (y close to 1), attack at the top.

export type Role = 'POR' | 'DEF' | 'MED' | 'DEL';

export interface FormationSlot {
  role: Role;
  x: number;
  y: number;
}

export interface Formation {
  /** Sent to the server as `formation`. */
  id: string;
  slots: FormationSlot[];
}

const line = (role: Role, y: number, xs: number[]): FormationSlot[] => xs.map((x) => ({ role, x, y }));

const GK = line('POR', 0.9, [0.5]);
const BACK4 = line('DEF', 0.74, [0.14, 0.38, 0.62, 0.86]);

export const FORMATIONS: readonly Formation[] = [
  {
    id: '4-3-3',
    slots: [...GK, ...BACK4, ...line('MED', 0.52, [0.24, 0.5, 0.76]), ...line('DEL', 0.26, [0.2, 0.5, 0.8])],
  },
  {
    id: '4-4-2',
    slots: [...GK, ...BACK4, ...line('MED', 0.52, [0.14, 0.38, 0.62, 0.86]), ...line('DEL', 0.26, [0.36, 0.64])],
  },
  {
    id: '4-2-3-1',
    slots: [
      ...GK,
      ...BACK4,
      ...line('MED', 0.6, [0.36, 0.64]),
      ...line('MED', 0.42, [0.2, 0.5, 0.8]),
      ...line('DEL', 0.22, [0.5]),
    ],
  },
  {
    id: '3-5-2',
    slots: [
      ...GK,
      ...line('DEF', 0.74, [0.2, 0.5, 0.8]),
      ...line('MED', 0.5, [0.1, 0.9]),
      ...line('MED', 0.56, [0.3, 0.5, 0.7]),
      ...line('DEL', 0.26, [0.36, 0.64]),
    ],
  },
];

export const DEFAULT_FORMATION_ID = '4-3-3';

export function formationById(id: string | null | undefined): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];
}
