"""Reads tournament, standings and matches.

READS use the USER'S JWT (RLS: authenticated users may SELECT these tables and the `standings` view,
which is `security_invoker`). `start` and `activate_round` use the SECRET key: the SQL functions are
revoked from anon/authenticated (migration 0010) and the admin role is checked by the service first.
"""
import logging
from datetime import datetime
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.supabase_clients import service_postgrest, user_postgrest
from app.domain.round_robin import Fixture
from app.domain.tournament import ClubRef, Match, MatchStatus, StandingRow, Tournament, TournamentStatus
from app.repositories._postgrest import upstream_error

logger = logging.getLogger(__name__)

# Stable codes raised by the SQL functions (message of `raise exception`) -> HTTP error.
_START_ERRORS: dict[str, tuple[int, str]] = {
    "TOURNAMENT_NOT_DRAFT": (409, "El torneo ya inició."),
    "PARTICIPANTS_CHANGED": (409, "Cambiaron los inscritos mientras se generaba el calendario. Intenta de nuevo."),
}
_ACTIVATE_ERRORS: dict[str, tuple[int, str]] = {
    "ROUND_CHANGED": (409, "La fecha activa cambió. Vuelve a consultar el torneo."),
    "ROUND_NOT_CLOSED": (409, "Hay partidos sin confirmar o resolver en la fecha actual."),
}


class TournamentRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get_current(self, access_token: str) -> Tournament | None:
        """The MVP runs a single tournament: the most recently created one."""
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("tournaments")
                .select("id,name,status,current_round,max_participants,started_at,tournament_participants(count)")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el torneo") from None
        if not rows:
            return None
        r = rows[0]
        return Tournament(
            id=UUID(r["id"]),
            name=r["name"],
            status=TournamentStatus(r["status"]),
            current_round=r["current_round"],
            max_participants=r["max_participants"],
            participant_count=r["tournament_participants"][0]["count"],
            started_at=datetime.fromisoformat(r["started_at"]) if r["started_at"] else None,
        )

    def start(self, tournament_id: UUID, fixtures: list[Fixture[UUID]]) -> None:
        """SECRET key: atomic SQL function (migration 0010) that flips DRAFT -> ACTIVE and inserts every match."""
        payload = [
            {"round": f.round, "leg": f.leg, "home": str(f.home), "away": str(f.away)} for f in fixtures
        ]
        self._rpc("start_tournament", {"p_tournament": str(tournament_id), "p_fixtures": payload}, _START_ERRORS)

    def activate_round(self, tournament_id: UUID, expected_round: int) -> int:
        """SECRET key: atomic SQL function. Succeeds only if the tournament is still at `expected_round`."""
        data = self._rpc(
            "activate_round",
            {"p_tournament": str(tournament_id), "p_expected_round": expected_round},
            _ACTIVATE_ERRORS,
        )
        return int(data)

    def _rpc(self, name: str, params: dict, errors: dict[str, tuple[int, str]]):
        try:
            return service_postgrest(self._settings).rpc(name, params).execute().data
        except APIError as exc:
            mapped = errors.get(exc.message)
            if mapped is not None:
                status, message = mapped
                raise AppError(exc.message, message, status) from None
            logger.error("%s failed: code=%s", name, exc.code)
            raise AppError("UPSTREAM_ERROR", "No se pudo completar la operación.", 502) from None

    def get_standings(self, tournament_id: UUID, access_token: str) -> list[StandingRow]:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("standings")
                .select(
                    "position,participant_id,club_id,club_name,club_short_name,played,won,drawn,lost,"
                    "goals_for,goals_against,goal_difference,points"
                )
                .eq("tournament_id", str(tournament_id))
                .order("position")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "la clasificación") from None
        return [
            StandingRow(
                **{k: r[k] for k in (
                    "position", "club_name", "club_short_name", "played", "won", "drawn", "lost",
                    "goals_for", "goals_against", "goal_difference", "points")},
                participant_id=UUID(r["participant_id"]),
                club_id=UUID(r["club_id"]),
            )
            for r in rows
        ]

    def get_matches(self, tournament_id: UUID, clubs: dict[UUID, ClubRef], access_token: str) -> list[Match]:
        """`clubs` maps participant id -> club, so the DTO can show names without a second round trip per match."""
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("matches")
                .select("id,round,leg,status,home_participant_id,away_participant_id,home_score,away_score")
                .eq("tournament_id", str(tournament_id))
                .order("round")
                .order("leg")
                .order("created_at")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el calendario") from None
        return [
            Match(
                id=UUID(r["id"]),
                round=r["round"],
                leg=r["leg"],
                status=MatchStatus(r["status"]),
                home=clubs[UUID(r["home_participant_id"])],
                away=clubs[UUID(r["away_participant_id"])],
                home_score=r["home_score"],
                away_score=r["away_score"],
            )
            for r in rows
        ]
