from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.domain.match import EventType, Lineup, MatchDetail, MatchEvent, Player
from app.domain.tournament import AdminParticipant, MatchStatus
from app.schemas.common import CamelModel
from app.schemas.tournament import FixtureTeam, TournamentResponse


def player_photo_url(player_id: UUID) -> str:
    # Served by the backend (never Supabase directly): see api/media.py.
    return f"/media/players/{player_id}"


class EventRequest(CamelModel):
    """The client generates `id` (offline queue); re-sending the same id is harmless.
    `participant_id` is NOT trusted: the service compares it with the caller's own participant."""

    id: UUID
    participant_id: UUID
    player_id: UUID
    type: EventType
    minute: int  # range checked in the service (INVALID_MINUTE), the DB has a CHECK as last line


class EventResponse(CamelModel):
    id: UUID
    match_id: UUID
    participant_id: UUID
    player_id: UUID
    player_name: str | None
    type: EventType
    minute: int
    created_at: datetime

    @classmethod
    def from_domain(cls, e: MatchEvent) -> "EventResponse":
        return cls(
            id=e.id, match_id=e.match_id, participant_id=e.participant_id, player_id=e.player_id,
            player_name=e.player_name, type=e.type, minute=e.minute, created_at=e.created_at,
        )


class RecordEventResponse(EventResponse):
    already_recorded: bool

    @classmethod
    def of(cls, e: MatchEvent, already_recorded: bool) -> "RecordEventResponse":
        return cls(**EventResponse.from_domain(e).model_dump(), already_recorded=already_recorded)


class MatchDetailResponse(CamelModel):
    id: UUID
    round: int
    leg: int
    status: MatchStatus
    home: FixtureTeam
    away: FixtureTeam
    home_score: int | None
    away_score: int | None
    finished_at: datetime | None
    confirmed_at: datetime | None
    resolution_note: str | None
    events: list[EventResponse]

    @classmethod
    def from_domain(cls, d: MatchDetail) -> "MatchDetailResponse":
        m = d.match
        return cls(
            id=m.id, round=m.round, leg=m.leg, status=m.status,
            home=FixtureTeam.from_domain(d.home), away=FixtureTeam.from_domain(d.away),
            home_score=m.home_score, away_score=m.away_score,
            finished_at=m.finished_at, confirmed_at=m.confirmed_at, resolution_note=m.resolution_note,
            events=[EventResponse.from_domain(e) for e in d.events],
        )


class ResolveRequest(CamelModel):
    home_score: int = Field(ge=0, le=99)
    away_score: int = Field(ge=0, le=99)
    note: str | None = Field(default=None, max_length=500)


class StartTournamentResponse(CamelModel):
    tournament: TournamentResponse
    participant_count: int
    round_count: int
    match_count: int


class ActivateRoundResponse(CamelModel):
    current_round: int
    activated_matches: int


class AdminParticipantResponse(CamelModel):
    id: UUID
    user_id: UUID
    display_name: str
    club: FixtureTeam
    joined_at: datetime

    @classmethod
    def from_domain(cls, p: AdminParticipant) -> "AdminParticipantResponse":
        return cls(
            id=p.id, user_id=p.user_id, display_name=p.display_name, club=FixtureTeam.from_domain(p.club),
            joined_at=p.joined_at,
        )


class PlayerResponse(CamelModel):
    id: UUID
    name: str
    position: str
    overall_rating: int | None
    age: int | None
    nationality: str | None
    shirt_number: int | None
    photo_url: str

    @classmethod
    def from_domain(cls, p: Player) -> "PlayerResponse":
        return cls(
            id=p.id, name=p.name, position=p.position, overall_rating=p.overall_rating, age=p.age,
            nationality=p.nationality, shirt_number=p.shirt_number, photo_url=player_photo_url(p.id),
        )


class LineupSlotModel(CamelModel):
    player_id: UUID
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class LineupRequest(CamelModel):
    formation: str = Field(pattern=r"^[0-9]{1,2}(-[0-9]{1,2}){1,5}$", max_length=20)
    positions: list[LineupSlotModel]


class LineupResponse(CamelModel):
    participant_id: UUID
    formation: str
    positions: list[LineupSlotModel]
    updated_at: datetime

    @classmethod
    def from_domain(cls, lineup: Lineup) -> "LineupResponse":
        return cls(
            participant_id=lineup.participant_id, formation=lineup.formation,
            positions=[LineupSlotModel(player_id=s.player_id, x=s.x, y=s.y) for s in lineup.positions],
            updated_at=lineup.updated_at,
        )
