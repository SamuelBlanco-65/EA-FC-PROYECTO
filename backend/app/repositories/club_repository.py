"""Reads `clubs`. Client used: the USER'S JWT (RLS: any authenticated user may read clubs)."""
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.supabase_clients import user_postgrest
from app.domain.tournament import Club
from app.repositories._postgrest import upstream_error

COLUMNS = "id,name,short_name,league,country,primary_color,secondary_color"


def club_from_row(row: dict) -> Club:
    return Club(
        id=UUID(row["id"]),
        name=row["name"],
        short_name=row["short_name"],
        league=row["league"],
        country=row["country"],
        primary_color=row["primary_color"],
        secondary_color=row["secondary_color"],
    )


class ClubRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def list_all(self, access_token: str) -> list[Club]:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("clubs")
                .select(COLUMNS)
                .order("league")
                .order("league_rank")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "los clubes") from None
        return [club_from_row(r) for r in rows]
