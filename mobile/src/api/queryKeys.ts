// Pure on purpose (no storage import): the logic tests load it under plain node.
export const queryKeys = {
  participation: ['participation'] as const,
  tournament: ['tournament'] as const,
  standings: ['standings'] as const,
  fixtures: ['fixtures'] as const,
  squad: ['squad'] as const,
  lineup: ['lineup'] as const,
  adminParticipants: ['admin', 'participants'] as const,
  adminMatches: ['admin', 'matches'] as const,
  match: (id: string) => ['match', id] as const,
};
