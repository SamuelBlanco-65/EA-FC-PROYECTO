"""Plain data types shared between repositories and services. No I/O, no framework."""
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class TournamentStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"


class MatchStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"
    CONFIRMED = "CONFIRMED"
    DISPUTED = "DISPUTED"
    RESOLVED = "RESOLVED"


@dataclass(frozen=True)
class Tournament:
    id: UUID
    name: str
    status: TournamentStatus
    current_round: int
    max_participants: int
    participant_count: int
    started_at: datetime | None


@dataclass(frozen=True)
class Club:
    id: UUID
    name: str
    short_name: str
    league: str
    country: str
    primary_color: str | None
    secondary_color: str | None


@dataclass(frozen=True)
class Participant:
    id: UUID
    tournament_id: UUID
    club_id: UUID
    joined_at: datetime


@dataclass(frozen=True)
class StandingRow:
    position: int
    participant_id: UUID
    club_id: UUID
    club_name: str
    club_short_name: str
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int


@dataclass(frozen=True)
class ClubRef:
    participant_id: UUID
    club_id: UUID
    name: str
    short_name: str


@dataclass(frozen=True)
class Match:
    id: UUID
    round: int
    leg: int
    status: MatchStatus
    home: ClubRef
    away: ClubRef
    home_score: int | None
    away_score: int | None


@dataclass(frozen=True)
class Assignment:
    participant: Participant
    club: Club
    clubs: list[Club]  # whole pool, so the app can animate the roulette
    already_assigned: bool
