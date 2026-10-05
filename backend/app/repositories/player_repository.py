"""Reads `players`. Client used: the USER'S JWT (RLS: any authenticated user may read players)."""
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.supabase_clients import user_postgrest
from app.domain.match import Player
from app.repositories._postgrest import upstream_error

COLUMNS = "id,club_id,name,position,overall_rating,age,nationality,shirt_number,pace,shooting,passing,dribbling,defending,physical"


def _player(r: dict) -> Player:
    return Player(
        id=UUID(r["id"]),
        club_id=UUID(r["club_id"]),
        name=r["name"],
        position=r["position"],
        overall_rating=r["overall_rating"],
        age=r["age"],
        nationality=r["nationality"],
        shirt_number=r["shirt_number"],
        pace=r["pace"],
        shooting=r["shooting"],
        passing=r["passing"],
        dribbling=r["dribbling"],
        defending=r["defending"],
        physical=r["physical"],
    )


class PlayerRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def list_by_club(self, club_id: UUID, access_token: str) -> list[Player]:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("players")
                .select(COLUMNS)
                .eq("club_id", str(club_id))
                .order("overall_rating", desc=True, nullsfirst=False)
                .order("name")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "la plantilla") from None
        return [_player(r) for r in rows]

    def get(self, player_id: UUID, access_token: str) -> Player | None:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("players")
                .select(COLUMNS)
                .eq("id", str(player_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el jugador") from None
        return _player(rows[0]) if rows else None
