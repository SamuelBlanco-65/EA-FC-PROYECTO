"""`matches` and `match_events`.

Two clients, on purpose:
- READS and the event INSERT use the user's JWT: RLS applies (the insert policy re-checks that the event is
  the caller's own, the match is ACTIVE and the player belongs to the club: defence in depth).
- STATE CHANGES (`transition`) use the SECRET key: participants have no UPDATE grant on `matches`
  (migration 0006). The service has already checked who the caller is before calling.
"""
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.supabase_clients import service_postgrest, user_postgrest
from app.domain.match import EventType, MatchEvent, MatchRecord
from app.domain.tournament import MatchStatus
from app.repositories._postgrest import upstream_error

logger = logging.getLogger(__name__)

MATCH_COLUMNS = (
    "id,tournament_id,round,leg,status,home_participant_id,away_participant_id,home_score,away_score,"
    "finished_at,confirmed_at,resolution_note"
)
EVENT_COLUMNS = "id,match_id,participant_id,player_id,type,minute,created_at,players(name)"

RLS_VIOLATION = "42501"


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def match_from_row(r: dict) -> MatchRecord:
    return MatchRecord(
        id=UUID(r["id"]),
        tournament_id=UUID(r["tournament_id"]),
        round=r["round"],
        leg=r["leg"],
        status=MatchStatus(r["status"]),
        home_participant_id=UUID(r["home_participant_id"]),
        away_participant_id=UUID(r["away_participant_id"]),
        home_score=r["home_score"],
        away_score=r["away_score"],
        finished_at=_dt(r["finished_at"]),
        confirmed_at=_dt(r["confirmed_at"]),
        resolution_note=r["resolution_note"],
    )


def event_from_row(r: dict) -> MatchEvent:
    return MatchEvent(
        id=UUID(r["id"]),
        match_id=UUID(r["match_id"]),
        participant_id=UUID(r["participant_id"]),
        player_id=UUID(r["player_id"]),
        player_name=(r.get("players") or {}).get("name"),
        type=EventType(r["type"]),
        minute=r["minute"],
        created_at=datetime.fromisoformat(r["created_at"]),
    )


class MatchRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get(self, match_id: UUID, access_token: str) -> MatchRecord | None:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("matches")
                .select(MATCH_COLUMNS)
                .eq("id", str(match_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el partido") from None
        return match_from_row(rows[0]) if rows else None

    def list_for_tournament(
        self, tournament_id: UUID, access_token: str, status: MatchStatus | None = None
    ) -> list[MatchRecord]:
        try:
            query = (
                user_postgrest(self._settings, access_token)
                .from_("matches")
                .select(MATCH_COLUMNS)
                .eq("tournament_id", str(tournament_id))
            )
            if status is not None:
                query = query.eq("status", status.value)
            rows = query.order("round").order("leg").order("created_at").execute().data
        except APIError as exc:
            raise upstream_error(exc, "los partidos") from None
        return [match_from_row(r) for r in rows]

    def list_events(self, match_id: UUID, access_token: str) -> list[MatchEvent]:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("match_events")
                .select(EVENT_COLUMNS)
                .eq("match_id", str(match_id))
                .order("minute")
                .order("created_at")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "los eventos") from None
        return [event_from_row(r) for r in rows]

    def get_event(self, event_id: UUID, access_token: str) -> MatchEvent | None:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("match_events")
                .select(EVENT_COLUMNS)
                .eq("id", str(event_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el evento") from None
        return event_from_row(rows[0]) if rows else None

    def insert_event(
        self,
        *,
        event_id: UUID,
        match_id: UUID,
        participant_id: UUID,
        player_id: UUID,
        type: EventType,
        minute: int,
        created_by: UUID,
        access_token: str,
    ) -> bool:
        """INSERT ... ON CONFLICT (id) DO NOTHING. True = inserted, False = that id already existed."""
        row = {
            "id": str(event_id),
            "match_id": str(match_id),
            "participant_id": str(participant_id),
            "player_id": str(player_id),
            "type": type.value,
            "minute": minute,
            "created_by": str(created_by),
        }
        try:
            data = (
                user_postgrest(self._settings, access_token)
                .from_("match_events")
                .upsert(row, on_conflict="id", ignore_duplicates=True)
                .execute()
                .data
            )
        except APIError as exc:
            if exc.code == RLS_VIOLATION:
                # The service validated everything, so the policy only fails if the match left ACTIVE meanwhile.
                raise AppError("MATCH_NOT_ACTIVE", "El partido ya no está activo.", 409) from None
            raise upstream_error(exc, "el evento") from None
        return bool(data)

    def transition(self, match_id: UUID, expected_status: MatchStatus, changes: dict[str, Any]) -> MatchRecord | None:
        """UPDATE ... WHERE id = ? AND status = <expected>. None = 0 rows: someone else moved the match first."""
        try:
            rows = (
                service_postgrest(self._settings)
                .from_("matches")
                .update(changes)
                .eq("id", str(match_id))
                .eq("status", expected_status.value)
                .execute()
                .data
            )
        except APIError as exc:
            logger.error("match transition failed: code=%s", exc.code)
            raise AppError("UPSTREAM_ERROR", "No se pudo actualizar el partido.", 502) from None
        return match_from_row(rows[0]) if rows else None
