from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.deps import get_current_user, get_match_service
from app.domain.user import CurrentUser
from app.schemas.common import ErrorResponse
from app.schemas.match import EventRequest, MatchDetailResponse, RecordEventResponse
from app.services.match_service import MatchService

router = APIRouter(prefix="/matches", tags=["matches"])

_ERRORS = {
    401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
    403: {"model": ErrorResponse, "description": "NOT_A_PARTICIPANT / NOT_IN_MATCH / NOT_YOUR_TEAM / NOT_MATCH_HOME / NOT_MATCH_AWAY"},
    404: {"model": ErrorResponse, "description": "MATCH_NOT_FOUND / TOURNAMENT_NOT_FOUND"},
    409: {"model": ErrorResponse, "description": "MATCH_NOT_ACTIVE / ROUND_NOT_ACTIVE / INVALID_TRANSITION / MATCH_STATE_CHANGED / EVENT_ID_CONFLICT"},
}


@router.get("/{match_id}", response_model=MatchDetailResponse, summary="Partido con sus eventos", responses=_ERRORS)
def get_match(
    match_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    service: MatchService = Depends(get_match_service),
) -> MatchDetailResponse:
    return MatchDetailResponse.from_domain(service.detail(user, match_id))


@router.post(
    "/{match_id}/events",
    response_model=RecordEventResponse,
    status_code=201,
    summary="Registrar un evento de MI equipo (idempotente por id: reenviarlo devuelve 200)",
    responses=_ERRORS,
)
def record_event(
    match_id: UUID,
    body: EventRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
    service: MatchService = Depends(get_match_service),
) -> RecordEventResponse:
    event, created = service.record_event(
        user, match_id, event_id=body.id, participant_id=body.participant_id, player_id=body.player_id,
        type=body.type, minute=body.minute,
    )
    if not created:
        response.status_code = 200
    return RecordEventResponse.of(event, already_recorded=not created)


@router.post("/{match_id}/finish", response_model=MatchDetailResponse,
             summary="Finalizar (solo el local). El marcador lo calcula el servidor", responses=_ERRORS)
def finish_match(
    match_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    service: MatchService = Depends(get_match_service),
) -> MatchDetailResponse:
    return MatchDetailResponse.from_domain(service.finish(user, match_id))


@router.post("/{match_id}/confirm", response_model=MatchDetailResponse,
             summary="Confirmar el resultado (solo el visitante)", responses=_ERRORS)
def confirm_match(
    match_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    service: MatchService = Depends(get_match_service),
) -> MatchDetailResponse:
    return MatchDetailResponse.from_domain(service.confirm(user, match_id))


@router.post("/{match_id}/reject", response_model=MatchDetailResponse,
             summary="Rechazar el resultado -> DISPUTED (solo el visitante)", responses=_ERRORS)
def reject_match(
    match_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    service: MatchService = Depends(get_match_service),
) -> MatchDetailResponse:
    return MatchDetailResponse.from_domain(service.reject(user, match_id))
