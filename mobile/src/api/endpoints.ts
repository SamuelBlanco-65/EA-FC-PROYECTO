import { apiFetch } from './client';
import type {
  ActivateRoundResponse,
  AdminParticipant,
  AssignClubResponse,
  EventPayload,
  Fixture,
  Lineup,
  LineupSlot,
  MatchDetail,
  MyParticipation,
  Player,
  RecordEventResponse,
  ResolveBody,
  SessionResponse,
  StandingRow,
  StartTournamentResponse,
  Tournament,
} from './types';

export const api = {
  login: (email: string, password: string) =>
    apiFetch<SessionResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (email: string, password: string, displayName: string) =>
    apiFetch<SessionResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
      auth: false,
    }),

  myParticipation: () => apiFetch<MyParticipation>('/participants/me'),
  assignClub: () => apiFetch<AssignClubResponse>('/participants/me/assign-club', { method: 'POST' }),

  tournament: () => apiFetch<Tournament>('/tournament'),
  standings: () => apiFetch<StandingRow[]>('/tournament/standings'),
  fixtures: () => apiFetch<Fixture[]>('/tournament/fixtures'),

  mySquad: () => apiFetch<Player[]>('/me/squad'),
  lineup: () => apiFetch<Lineup>('/lineups/me'),
  saveLineup: (formation: string, positions: LineupSlot[]) =>
    apiFetch<Lineup>('/lineups/me', { method: 'PUT', body: { formation, positions } }),
  match: (id: string) => apiFetch<MatchDetail>(`/matches/${id}`),
  recordEvent: (matchId: string, event: EventPayload) =>
    apiFetch<RecordEventResponse>(`/matches/${matchId}/events`, { method: 'POST', body: event }),
  finishMatch: (id: string) => apiFetch<MatchDetail>(`/matches/${id}/finish`, { method: 'POST' }),
  confirmMatch: (id: string) => apiFetch<MatchDetail>(`/matches/${id}/confirm`, { method: 'POST' }),
  rejectMatch: (id: string) => apiFetch<MatchDetail>(`/matches/${id}/reject`, { method: 'POST' }),

  // Admin (the server answers 403 FORBIDDEN to anyone else; the app only hides the entry point).
  adminParticipants: () => apiFetch<AdminParticipant[]>('/admin/participants'),
  adminMatches: () => apiFetch<Fixture[]>('/admin/matches'),
  startTournament: () => apiFetch<StartTournamentResponse>('/admin/tournament/start', { method: 'POST' }),
  activateNextRound: () => apiFetch<ActivateRoundResponse>('/admin/rounds/next/activate', { method: 'POST' }),
  resolveMatch: (id: string, body: ResolveBody) =>
    apiFetch<MatchDetail>(`/admin/matches/${id}/resolve`, { method: 'POST', body }),
};
