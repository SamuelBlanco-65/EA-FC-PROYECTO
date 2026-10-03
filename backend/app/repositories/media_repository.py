"""Images of the PRIVATE `media` bucket (crests, player photos).

Secret key on purpose: the bucket has no storage policies, so only the backend can read it. The caller
(the media router) has already authenticated the user.
"""
import logging
from urllib.parse import quote
from uuid import UUID

import httpx
from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.supabase_clients import shared_http, service_postgrest

logger = logging.getLogger(__name__)

BUCKET = "media"


class MediaRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def crest_path(self, club_id: UUID) -> str | None:
        return self._path("clubs", "crest_path", club_id)

    def photo_path(self, player_id: UUID) -> str | None:
        return self._path("players", "photo_path", player_id)

    def _path(self, table: str, column: str, row_id: UUID) -> str | None:
        try:
            rows = (
                service_postgrest(self._settings)
                .from_(table)
                .select(column)
                .eq("id", str(row_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            logger.error("media path lookup failed: table=%s code=%s", table, exc.code)
            raise AppError("UPSTREAM_ERROR", "No se pudo leer la imagen.", 502) from None
        return rows[0][column] if rows else None

    def download(self, path: str) -> bytes | None:
        """Raw bytes of one object, or None if Storage does not have it."""
        key = self._settings.supabase_secret_key.get_secret_value()
        url = f"{self._settings.supabase_url}/storage/v1/object/{BUCKET}/{quote(path)}"
        try:
            response = shared_http().get(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        except httpx.HTTPError as exc:
            logger.error("storage download failed: %s", type(exc).__name__)
            raise AppError("UPSTREAM_UNAVAILABLE", "No se pudo leer la imagen.", 503) from None
        if response.status_code in (400, 404):  # Storage answers 400 or 404 for a missing object
            return None
        if response.status_code != 200:
            logger.error("storage download failed: status=%s", response.status_code)
            raise AppError("UPSTREAM_ERROR", "No se pudo leer la imagen.", 502)
        return response.content
