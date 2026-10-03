from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import get_current_user, get_media_service
from app.domain.user import CurrentUser
from app.schemas.common import ErrorResponse
from app.services.media_service import MediaFile, MediaService

router = APIRouter(prefix="/media", tags=["media"])

_RESPONSES = {
    200: {"content": {"image/png": {}}, "description": "PNG"},
    304: {"description": "Sin cambios (If-None-Match)"},
    401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
    404: {"model": ErrorResponse, "description": "MEDIA_NOT_FOUND"},
}
# `private`: the response is only for a logged-in user, so shared caches must not keep it.
_CACHE_CONTROL = "private, max-age=86400"


def _image(request: Request, file: MediaFile) -> Response:
    headers = {"ETag": file.etag, "Cache-Control": _CACHE_CONTROL}
    if request.headers.get("if-none-match") == file.etag:
        return Response(status_code=304, headers=headers)
    return Response(content=file.content, media_type="image/png", headers=headers)


@router.get("/crests/{club_id}", summary="Escudo de un club (PNG)", responses=_RESPONSES, response_class=Response)
def crest(
    club_id: UUID,
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
) -> Response:
    return _image(request, service.crest(club_id))


@router.get("/players/{player_id}", summary="Foto de un jugador (PNG)", responses=_RESPONSES, response_class=Response)
def player_photo(
    player_id: UUID,
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
    service: MediaService = Depends(get_media_service),
) -> Response:
    return _image(request, service.player_photo(player_id))
