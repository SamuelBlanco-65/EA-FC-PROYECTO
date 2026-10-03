"""`tournament_participants`.

Two clients, on purpose:
- READS use the user's JWT (RLS applies).
- `assign_random_club` uses the SECRET key: the SQL function is revoked from anon/authenticated
  (migration 0005) so nobody can pick or re-roll a club by calling it from outside the backend.
"""
import logging
from datetime import datetime
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.supabase_clients import service_postgrest, user_postgrest
from app.domain.tournament import AdminParticipant, ClubRef, Participant
from app.repositories._postgrest import upstream_error

logger = logging.getLogger(__name__)

# Stable codes raised by the SQL function (message of `raise exception`) -> HTTP error.
_ASSIGN_ERRORS: dict[str, tuple[int, str]] = {
    "TOURNAMENT_NOT_FOUND": (404, "No hay un torneo disponible."),
    "TOURNAMENT_NOT_DRAFT": (409, "La inscripción está cerrada: el torneo ya inició."),
    "TOURNAMENT_FULL": (409, "El torneo está lleno."),
    "NO_FREE_CLUBS": (409, "No quedan clubes libres."),
    "USER_NOT_FOUND": (403, "Tu perfil no existe."),
    "ASSIGNMENT_RETRIES_EXHAUSTED": (503, "No se pudo asignar un club. Intenta de nuevo."),
}


def _participant(row: dict) -> Participant:
    return Participant(
        id=UUID(row["id"]),
        tournament_id=UUID(row["tournament_id"]),
        club_id=UUID(row["club_id"]),
        joined_at=datetime.fromisoformat(row["joined_at"]),
    )


class ParticipantRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def find_own(self, tournament_id: UUID, user_id: UUID, access_token: str) -> Participant | None:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("tournament_participants")
                .select("id,tournament_id,club_id,joined_at")
                .eq("tournament_id", str(tournament_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "tu inscripción") from None
        return _participant(rows[0]) if rows else None

    def club_refs(self, tournament_id: UUID, access_token: str) -> dict[UUID, ClubRef]:
        """participant id -> club, for every participant of the tournament."""
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("tournament_participants")
                .select("id,club_id,clubs(name,short_name)")
                .eq("tournament_id", str(tournament_id))
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "los participantes") from None
        return {
            UUID(r["id"]): ClubRef(
                participant_id=UUID(r["id"]),
                club_id=UUID(r["club_id"]),
                name=r["clubs"]["name"],
                short_name=r["clubs"]["short_name"],
            )
            for r in rows
        }

    def list_for_admin(self, tournament_id: UUID) -> list[AdminParticipant]:
        """Secret key: the display name lives in `profiles`, where RLS only lets each user read their OWN row.
        The caller (admin endpoint) has already been authorised."""
        try:
            rows = (
                service_postgrest(self._settings)
                .from_("tournament_participants")
                .select("id,user_id,club_id,joined_at,profiles(display_name),clubs(name,short_name)")
                .eq("tournament_id", str(tournament_id))
                .order("joined_at")
                .execute()
                .data
            )
        except APIError as exc:
            logger.error("list participants failed: code=%s", exc.code)
            raise AppError("UPSTREAM_ERROR", "No se pudo leer los participantes.", 502) from None
        return [
            AdminParticipant(
                id=UUID(r["id"]),
                user_id=UUID(r["user_id"]),
                display_name=r["profiles"]["display_name"],
                club=ClubRef(UUID(r["id"]), UUID(r["club_id"]), r["clubs"]["name"], r["clubs"]["short_name"]),
                joined_at=datetime.fromisoformat(r["joined_at"]),
            )
            for r in rows
        ]

    def assign_random_club(self, tournament_id: UUID, user_id: UUID) -> Participant:
        try:
            data = (
                service_postgrest(self._settings)
                .rpc("assign_random_club", {"p_tournament": str(tournament_id), "p_user": str(user_id)})
                .execute()
                .data
            )
        except APIError as exc:
            mapped = _ASSIGN_ERRORS.get(exc.message)
            if mapped is not None:
                status, message = mapped
                raise AppError(exc.message, message, status) from None
            logger.error("assign_random_club failed: code=%s", exc.code)
            raise AppError("UPSTREAM_ERROR", "No se pudo asignar el club.", 502) from None
        return _participant(data)
