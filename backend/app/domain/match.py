"""Match and event data types plus the score rule. Pure: no I/O."""
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from app.domain.tournament import ClubRef, MatchStatus

MIN_MINUTE = 1
MAX_MINUTE = 120


class EventType(StrEnum):
    GOAL = "GOAL"
    YELLOW = "YELLOW"
    RED = "RED"


@dataclass(frozen=True)
class MatchRecord:
    """A `matches` row as the services need it (participant ids, not club names)."""

    id: UUID
    tournament_id: UUID
    round: int
    leg: int
    status: MatchStatus
    home_participant_id: UUID
    away_participant_id: UUID
    home_score: int | None
    away_score: int | None
    finished_at: datetime | None
    confirmed_at: datetime | None
    resolution_note: str | None


@dataclass(frozen=True)
class MatchEvent:
    id: UUID
    match_id: UUID
    participant_id: UUID
    player_id: UUID
    player_name: str | None
    type: EventType
    minute: int
    created_at: datetime


@dataclass(frozen=True)
class MatchDetail:
    match: MatchRecord
    home: ClubRef
    away: ClubRef
    events: list[MatchEvent]


@dataclass(frozen=True)
class Player:
    id: UUID
    club_id: UUID
    name: str
    position: str
    overall_rating: int | None
    age: int | None
    nationality: str | None
    shirt_number: int | None


@dataclass(frozen=True)
class LineupSlot:
    player_id: UUID
    x: float
    y: float


@dataclass(frozen=True)
class Lineup:
    participant_id: UUID
    formation: str
    positions: list[LineupSlot]
    updated_at: datetime


def is_valid_minute(minute: int) -> bool:
    return MIN_MINUTE <= minute <= MAX_MINUTE


def derive_score(events: Iterable[MatchEvent], home_participant_id: UUID, away_participant_id: UUID) -> tuple[int, int]:
    """(home, away) goals. Only GOAL events count, and each goal belongs to the team that recorded it
    (events can only be recorded for the caller's own team, so there are no own goals in the MVP)."""
    home = away = 0
    for e in events:
        if e.type is not EventType.GOAL:
            continue
        if e.participant_id == home_participant_id:
            home += 1
        elif e.participant_id == away_participant_id:
            away += 1
    return home, away
