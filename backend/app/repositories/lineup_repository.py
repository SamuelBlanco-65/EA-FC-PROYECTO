"""`lineups`. Client used: the USER'S JWT. RLS lets each user read/write only the lineup of their own
participant row, so even a bug in the service could not touch someone else's lineup."""
from datetime import UTC, datetime
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.supabase_clients import user_postgrest
from app.domain.match import Lineup, LineupSlot
from app.repositories._postgrest import upstream_error

COLUMNS = "participant_id,formation,positions,updated_at"


def _lineup(r: dict) -> Lineup:
    return Lineup(
        participant_id=UUID(r["participant_id"]),
        formation=r["formation"],
        positions=[LineupSlot(UUID(p["playerId"]), float(p["x"]), float(p["y"])) for p in r["positions"]],
        updated_at=datetime.fromisoformat(r["updated_at"]),
    )


class LineupRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get(self, participant_id: UUID, access_token: str) -> Lineup | None:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("lineups")
                .select(COLUMNS)
                .eq("participant_id", str(participant_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "la alineación") from None
        return _lineup(rows[0]) if rows else None

    def upsert(self, participant_id: UUID, formation: str, positions: list[LineupSlot], access_token: str) -> Lineup:
        row = {
            "participant_id": str(participant_id),
            "formation": formation,
            "positions": [{"playerId": str(p.player_id), "x": p.x, "y": p.y} for p in positions],
            "updated_at": datetime.now(UTC).isoformat(),
        }
        try:
            data = (
                user_postgrest(self._settings, access_token)
                .from_("lineups")
                .upsert(row, on_conflict="participant_id")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "la alineación") from None
        return _lineup(data[0])
