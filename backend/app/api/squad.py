from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_squad_service
from app.domain.match import LineupSlot
from app.domain.user import CurrentUser
from app.schemas.common import ErrorResponse
from app.schemas.match import LineupRequest, LineupResponse, PlayerResponse
from app.services.squad_service import SquadService

router = APIRouter(tags=["squad"])

_ERRORS = {
    401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
    403: {"model": ErrorResponse, "description": "NOT_A_PARTICIPANT"},
    404: {"model": ErrorResponse, "description": "TOURNAMENT_NOT_FOUND / LINEUP_NOT_FOUND"},
    422: {"model": ErrorResponse, "description": "VALIDATION_ERROR / INVALID_LINEUP / PLAYER_NOT_IN_CLUB"},
}


@router.get("/me/squad", response_model=list[PlayerResponse], summary="Plantilla de MI club", responses=_ERRORS)
def my_squad(
    user: CurrentUser = Depends(get_current_user),
    service: SquadService = Depends(get_squad_service),
) -> list[PlayerResponse]:
    return [PlayerResponse.from_domain(p) for p in service.squad(user)]


@router.get("/lineups/me", response_model=LineupResponse, summary="Mi alineación", responses=_ERRORS)
def get_my_lineup(
    user: CurrentUser = Depends(get_current_user),
    service: SquadService = Depends(get_squad_service),
) -> LineupResponse:
    return LineupResponse.from_domain(service.get_lineup(user))


@router.put("/lineups/me", response_model=LineupResponse, summary="Guardar mi alineación (reemplaza la anterior)",
            responses=_ERRORS)
def save_my_lineup(
    body: LineupRequest,
    user: CurrentUser = Depends(get_current_user),
    service: SquadService = Depends(get_squad_service),
) -> LineupResponse:
    slots = [LineupSlot(p.player_id, p.x, p.y) for p in body.positions]
    return LineupResponse.from_domain(service.save_lineup(user, body.formation, slots))
