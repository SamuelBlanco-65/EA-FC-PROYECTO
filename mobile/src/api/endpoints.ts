import { apiFetch } from './client';
import type {
  AssignClubResponse,
  EventPayload,
  Fixture,
  MatchDetail,
  MyParticipation,
  Player,
  RecordEventResponse,
  SessionResponse,
  StandingRow,
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
  match: (id: string) => apiFetch<MatchDetail>(`/matches/${id}`),
  recordEvent: (matchId: string, event: EventPayload) =>
    apiFetch<RecordEventResponse>(`/matches/${matchId}/events`, { method: 'POST', body: event }),
  finishMatch: (id: string) => apiFetch<MatchDetail>(`/matches/${id}/finish`, { method: 'POST' }),
  confirmMatch: (id: string) => apiFetch<MatchDetail>(`/matches/${id}/confirm`, { method: 'POST' }),
  rejectMatch: (id: string) => apiFetch<MatchDetail>(`/matches/${id}/reject`, { method: 'POST' }),
};
