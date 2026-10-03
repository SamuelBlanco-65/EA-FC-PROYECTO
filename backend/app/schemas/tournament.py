from datetime import datetime
from uuid import UUID

from app.domain.tournament import (
    Assignment, Club, ClubRef, Match, MatchStatus, Participant, StandingRow, Tournament, TournamentStatus,
)
from app.schemas.common import CamelModel


def crest_url(club_id: UUID) -> str:
    # Served by the backend (never Supabase directly): see api/media.py.
    return f"/media/crests/{club_id}"


class TournamentResponse(CamelModel):
    id: UUID
    name: str
    status: TournamentStatus
    current_round: int
    max_participants: int
    participant_count: int
    started_at: datetime | None

    @classmethod
    def from_domain(cls, t: Tournament) -> "TournamentResponse":
        return cls(
            id=t.id, name=t.name, status=t.status, current_round=t.current_round,
            max_participants=t.max_participants, participant_count=t.participant_count, started_at=t.started_at,
        )


class ClubResponse(CamelModel):
    id: UUID
    name: str
    short_name: str
    league: str
    country: str
    primary_color: str | None
    secondary_color: str | None
    crest_url: str

    @classmethod
    def from_domain(cls, c: Club) -> "ClubResponse":
        return cls(
            id=c.id, name=c.name, short_name=c.short_name, league=c.league, country=c.country,
            primary_color=c.primary_color, secondary_color=c.secondary_color, crest_url=crest_url(c.id),
        )


class ParticipantResponse(CamelModel):
    id: UUID
    tournament_id: UUID
    joined_at: datetime


class MyParticipationResponse(CamelModel):
    participant: ParticipantResponse
    club: ClubResponse

    @classmethod
    def from_domain(cls, participant: Participant, club: Club) -> "MyParticipationResponse":
        return cls(
            participant=ParticipantResponse(
                id=participant.id, tournament_id=participant.tournament_id, joined_at=participant.joined_at),
            club=ClubResponse.from_domain(club),
        )


class AssignClubResponse(CamelModel):
    participant: ParticipantResponse
    club: ClubResponse
    roulette_clubs: list[ClubResponse]
    already_assigned: bool

    @classmethod
    def from_domain(cls, a: Assignment) -> "AssignClubResponse":
        return cls(
            participant=ParticipantResponse(
                id=a.participant.id, tournament_id=a.participant.tournament_id, joined_at=a.participant.joined_at),
            club=ClubResponse.from_domain(a.club),
            roulette_clubs=[ClubResponse.from_domain(c) for c in a.clubs],
            already_assigned=a.already_assigned,
        )


class StandingRowResponse(CamelModel):
    position: int
    participant_id: UUID
    club_id: UUID
    club_name: str
    club_short_name: str
    crest_url: str
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int

    @classmethod
    def from_domain(cls, r: StandingRow) -> "StandingRowResponse":
        return cls(**{**r.__dict__, "crest_url": crest_url(r.club_id)})


class FixtureTeam(CamelModel):
    participant_id: UUID
    club_id: UUID
    name: str
    short_name: str
    crest_url: str

    @classmethod
    def from_domain(cls, c: ClubRef) -> "FixtureTeam":
        return cls(participant_id=c.participant_id, club_id=c.club_id, name=c.name, short_name=c.short_name,
                   crest_url=crest_url(c.club_id))


class FixtureResponse(CamelModel):
    id: UUID
    round: int
    leg: int
    status: MatchStatus
    home: FixtureTeam
    away: FixtureTeam
    home_score: int | None
    away_score: int | None

    @classmethod
    def from_domain(cls, m: Match) -> "FixtureResponse":
        return cls(
            id=m.id, round=m.round, leg=m.leg, status=m.status, home=FixtureTeam.from_domain(m.home),
            away=FixtureTeam.from_domain(m.away), home_score=m.home_score, away_score=m.away_score,
        )
