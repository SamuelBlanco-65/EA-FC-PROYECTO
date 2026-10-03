from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_tournament_service
from app.domain.user import CurrentUser
from app.schemas.common import ErrorResponse
from app.schemas.tournament import FixtureResponse, StandingRowResponse, TournamentResponse
from app.services.tournament_service import TournamentService

router = APIRouter(prefix="/tournament", tags=["tournament"])

_ERRORS = {
    401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
    404: {"model": ErrorResponse, "description": "TOURNAMENT_NOT_FOUND"},
}


@router.get("", response_model=TournamentResponse, summary="Torneo actual", responses=_ERRORS)
def get_tournament(
    user: CurrentUser = Depends(get_current_user),
    service: TournamentService = Depends(get_tournament_service),
) -> TournamentResponse:
    return TournamentResponse.from_domain(service.current(user))


@router.get(
    "/standings",
    response_model=list[StandingRowResponse],
    summary="Tabla de posiciones (solo partidos CONFIRMED/RESOLVED)",
    responses=_ERRORS,
)
def get_standings(
    user: CurrentUser = Depends(get_current_user),
    service: TournamentService = Depends(get_tournament_service),
) -> list[StandingRowResponse]:
    return [StandingRowResponse.from_domain(r) for r in service.standings(user)]


@router.get(
    "/fixtures",
    response_model=list[FixtureResponse],
    summary="Calendario: todos los partidos ordenados por fecha y vuelta",
    responses=_ERRORS,
)
def get_fixtures(
    user: CurrentUser = Depends(get_current_user),
    service: TournamentService = Depends(get_tournament_service),
) -> list[FixtureResponse]:
    return [FixtureResponse.from_domain(m) for m in service.fixtures(user)]
