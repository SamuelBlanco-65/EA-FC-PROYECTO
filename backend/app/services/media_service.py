"""Crest and photo lookup: row id -> storage path -> bytes."""
import hashlib
from dataclasses import dataclass
from uuid import UUID

from app.core.errors import AppError
from app.repositories.media_repository import MediaRepository


@dataclass(frozen=True)
class MediaFile:
    content: bytes
    etag: str


class MediaService:
    def __init__(self, media: MediaRepository) -> None:
        self._media = media

    def crest(self, club_id: UUID) -> MediaFile:
        return self._load(self._media.crest_path(club_id), "El escudo")

    def player_photo(self, player_id: UUID) -> MediaFile:
        return self._load(self._media.photo_path(player_id), "La foto")

    def _load(self, path: str | None, what: str) -> MediaFile:
        # Missing path (NULL: the scraper found no image) and missing object are the same thing for the app: 404.
        content = self._media.download(path) if path else None
        if content is None:
            raise AppError("MEDIA_NOT_FOUND", f"{what} no existe.", 404)
        return MediaFile(content=content, etag=f'"{hashlib.sha256(content).hexdigest()[:32]}"')
