"""Typed messages the server pushes over /ws. Mirrored by hand in mobile/src/realtime/events.ts.

They only NOTIFY (ids and the few numbers needed to decide what to refetch). The database stays the source
of truth: the app reacts by calling REST, so a lost message costs freshness, never correctness.
"""
from datetime import datetime
from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import Field, TypeAdapter

from app.domain.match import EventType
from app.schemas.common import CamelModel


class WireMessage(CamelModel):
    type: str


class AuthOk(WireMessage):
    type: Literal["AUTH_OK"] = "AUTH_OK"
    user_id: UUID


class Pong(WireMessage):
    type: Literal["PONG"] = "PONG"


class ResyncRequired(WireMessage):
    """Not one of the 8 domain events: sent when the backend lost its link to Supabase Realtime and may have
    missed changes. The app must refetch its REST state, same as after its own reconnection."""

    type: Literal["RESYNC_REQUIRED"] = "RESYNC_REQUIRED"


class MatchEventCreated(WireMessage):
    type: Literal["MATCH_EVENT_CREATED"] = "MATCH_EVENT_CREATED"
    match_id: UUID
    event_id: UUID
    participant_id: UUID
    player_id: UUID
    event_type: EventType
    minute: int
    created_at: datetime


class _MatchScore(WireMessage):
    match_id: UUID
    home_score: int | None
    away_score: int | None


class MatchResultPending(_MatchScore):
    type: Literal["MATCH_RESULT_PENDING"] = "MATCH_RESULT_PENDING"


class MatchConfirmed(_MatchScore):
    type: Literal["MATCH_CONFIRMED"] = "MATCH_CONFIRMED"


class MatchDisputed(_MatchScore):
    type: Literal["MATCH_DISPUTED"] = "MATCH_DISPUTED"


class MatchResolved(_MatchScore):
    type: Literal["MATCH_RESOLVED"] = "MATCH_RESOLVED"


class RoundActivated(WireMessage):
    type: Literal["ROUND_ACTIVATED"] = "ROUND_ACTIVATED"
    tournament_id: UUID
    round: int


class StandingsUpdated(WireMessage):
    type: Literal["STANDINGS_UPDATED"] = "STANDINGS_UPDATED"
    tournament_id: UUID
    match_id: UUID


class TournamentStarted(WireMessage):
    type: Literal["TOURNAMENT_STARTED"] = "TOURNAMENT_STARTED"
    tournament_id: UUID


ServerMessage = Annotated[
    Union[
        AuthOk,
        Pong,
        ResyncRequired,
        MatchEventCreated,
        MatchResultPending,
        MatchConfirmed,
        MatchDisputed,
        MatchResolved,
        RoundActivated,
        StandingsUpdated,
        TournamentStarted,
    ],
    Field(discriminator="type"),
]

server_message_adapter: TypeAdapter = TypeAdapter(ServerMessage)

# Domain events the realtime listener produces (the 8 required), in documentation order.
DOMAIN_EVENT_TYPES = (
    "MATCH_EVENT_CREATED",
    "MATCH_RESULT_PENDING",
    "MATCH_CONFIRMED",
    "MATCH_DISPUTED",
    "MATCH_RESOLVED",
    "ROUND_ACTIVATED",
    "STANDINGS_UPDATED",
    "TOURNAMENT_STARTED",
)


def to_wire(message: WireMessage) -> str:
    return message.model_dump_json(by_alias=True)
