"""Who must be notified about a match. SECRET key on purpose: the realtime listener runs without a user
session, and these are fixed, internal queries (never driven by client input)."""
from uuid import UUID

from app.core.config import Settings
from app.core.supabase_clients import service_postgrest

WARM_MATCH_LIMIT = 2000  # a 25-player tournament has 600 matches


class AudienceRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def participant_users(self) -> dict[UUID, UUID]:
        """participant id -> user id for every enrolment. Tiny table (<= 25 rows per tournament)."""
        rows = service_postgrest(self._settings).from_("tournament_participants").select("id,user_id").execute().data
        return {UUID(r["id"]): UUID(r["user_id"]) for r in rows}

    def match_participants(self, match_id: UUID) -> tuple[UUID, UUID] | None:
        rows = (
            service_postgrest(self._settings)
            .from_("matches")
            .select("home_participant_id,away_participant_id")
            .eq("id", str(match_id))
            .limit(1)
            .execute()
            .data
        )
        return (UUID(rows[0]["home_participant_id"]), UUID(rows[0]["away_participant_id"])) if rows else None

    def recent_match_participants(self) -> dict[UUID, tuple[UUID, UUID]]:
        rows = (
            service_postgrest(self._settings)
            .from_("matches")
            .select("id,home_participant_id,away_participant_id")
            .order("created_at", desc=True)
            .limit(WARM_MATCH_LIMIT)
            .execute()
            .data
        )
        return {
            UUID(r["id"]): (UUID(r["home_participant_id"]), UUID(r["away_participant_id"])) for r in rows
        }
