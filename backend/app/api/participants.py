from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_tournament_service
from app.domain.user import CurrentUser
from app.schemas.common import ErrorResponse
from app.schemas.tournament import AssignClubResponse
from app.services.tournament_service import TournamentService

router = APIRouter(prefix="/participants", tags=["participants"])


@router.post(
    "/me/assign-club",
    response_model=AssignClubResponse,
    summary="Inscribirse y recibir un club al azar (idempotente)",
    description=(
        "El servidor elige el club; el cuerpo de la petición no lleva datos. Si el usuario ya tiene "
        "club, lo devuelve con `alreadyAssigned=true`. `rouletteClubs` es el conjunto de clubes para animar la ruleta."
    ),
    responses={
        401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
        404: {"model": ErrorResponse, "description": "TOURNAMENT_NOT_FOUND"},
        409: {"model": ErrorResponse, "description": "TOURNAMENT_NOT_DRAFT / TOURNAMENT_FULL / NO_FREE_CLUBS"},
        503: {"model": ErrorResponse, "description": "ASSIGNMENT_RETRIES_EXHAUSTED (reintentar)"},
    },
)
def assign_club(
    user: CurrentUser = Depends(get_current_user),
    service: TournamentService = Depends(get_tournament_service),
) -> AssignClubResponse:
    return AssignClubResponse.from_domain(service.assign_club(user))
