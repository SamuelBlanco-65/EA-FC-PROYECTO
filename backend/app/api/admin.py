from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_admin_service, get_match_service, require_admin
from app.domain.tournament import MatchStatus
from app.domain.user import CurrentUser
from app.schemas.common import ErrorResponse
from app.schemas.match import (
    ActivateRoundResponse, AdminParticipantResponse, MatchDetailResponse, ResolveRequest, StartTournamentResponse,
)
from app.schemas.tournament import FixtureResponse, TournamentResponse
from app.services.admin_service import AdminService
from app.services.match_service import MatchService

# require_admin on the whole router: a new admin route cannot be added without the guard by accident.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

_ERRORS = {
    401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
    403: {"model": ErrorResponse, "description": "FORBIDDEN (no es administrador)"},
    404: {"model": ErrorResponse, "description": "TOURNAMENT_NOT_FOUND / MATCH_NOT_FOUND"},
    409: {"model": ErrorResponse, "description": "Estado incompatible: ver `error.code`"},
}


@router.post("/tournament/start", response_model=StartTournamentResponse,
             summary="Iniciar el torneo y generar el calendario (ida y vuelta)", responses=_ERRORS)
def start_tournament(
    admin: CurrentUser = Depends(require_admin),
    service: AdminService = Depends(get_admin_service),
) -> StartTournamentResponse:
    result = service.start_tournament(admin)
    return StartTournamentResponse(
        tournament=TournamentResponse.from_domain(result.tournament),
        participant_count=result.participant_count,
        round_count=result.round_count,
        match_count=result.match_count,
    )


@router.post("/rounds/next/activate", response_model=ActivateRoundResponse,
             summary="Activar la siguiente fecha (solo si la actual está cerrada)", responses=_ERRORS)
def activate_next_round(
    admin: CurrentUser = Depends(require_admin),
    service: AdminService = Depends(get_admin_service),
) -> ActivateRoundResponse:
    result = service.activate_next_round(admin)
    return ActivateRoundResponse(current_round=result.current_round, activated_matches=result.activated_matches)


@router.get("/matches", response_model=list[FixtureResponse], summary="Partidos, filtrables por estado",
            responses=_ERRORS)
def list_matches(
    status: MatchStatus | None = Query(default=None),
    admin: CurrentUser = Depends(require_admin),
    service: MatchService = Depends(get_match_service),
) -> list[FixtureResponse]:
    return [FixtureResponse.from_domain(m) for m in service.list_for_admin(admin, status)]


@router.post("/matches/{match_id}/resolve", response_model=MatchDetailResponse,
             summary="Fijar el marcador oficial (DISPUTED o PENDING_CONFIRMATION -> RESOLVED)", responses=_ERRORS)
def resolve_match(
    match_id: UUID,
    body: ResolveRequest,
    admin: CurrentUser = Depends(require_admin),
    service: MatchService = Depends(get_match_service),
) -> MatchDetailResponse:
    detail = service.resolve(admin, match_id, body.home_score, body.away_score, body.note)
    return MatchDetailResponse.from_domain(detail)


@router.get("/participants", response_model=list[AdminParticipantResponse],
            summary="Inscritos del torneo con su club", responses=_ERRORS)
def list_participants(
    admin: CurrentUser = Depends(require_admin),
    service: AdminService = Depends(get_admin_service),
) -> list[AdminParticipantResponse]:
    return [AdminParticipantResponse.from_domain(p) for p in service.participants(admin)]
