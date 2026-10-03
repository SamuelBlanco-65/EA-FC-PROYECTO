// Mirrors backend/app/schemas/*.py (camelCase on the wire). Edit both sides together.
export type UserRole = 'participant' | 'admin';
export type TournamentStatus = 'DRAFT' | 'ACTIVE' | 'FINISHED';
export type MatchStatus =
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DISPUTED'
  | 'RESOLVED';

export interface Me {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'bearer';
  user: Me;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  currentRound: number;
  maxParticipants: number;
  participantCount: number;
  startedAt: string | null;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  league: string;
  country: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  crestUrl: string;
}

export interface Participant {
  id: string;
  tournamentId: string;
  joinedAt: string;
}

export interface MyParticipation {
  participant: Participant;
  club: Club;
}

export interface AssignClubResponse extends MyParticipation {
  rouletteClubs: Club[];
  alreadyAssigned: boolean;
}

export interface StandingRow {
  position: number;
  participantId: string;
  clubId: string;
  clubName: string;
  clubShortName: string;
  crestUrl: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface FixtureTeam {
  participantId: string;
  clubId: string;
  name: string;
  shortName: string;
  crestUrl: string;
}

export interface Fixture {
  id: string;
  round: number;
  leg: number;
  status: MatchStatus;
  home: FixtureTeam;
  away: FixtureTeam;
  homeScore: number | null;
  awayScore: number | null;
}
