from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.domain.user import CurrentUser
from app.schemas.auth import MeResponse
from app.schemas.common import ErrorResponse

router = APIRouter(tags=["me"])


@router.get(
    "/me",
    response_model=MeResponse,
    summary="Usuario autenticado",
    responses={
        401: {"model": ErrorResponse, "description": "NOT_AUTHENTICATED / INVALID_TOKEN / TOKEN_EXPIRED"},
        403: {"model": ErrorResponse, "description": "PROFILE_NOT_FOUND"},
    },
)
def me(user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    return MeResponse(id=user.id, email=user.email, display_name=user.display_name, role=user.role)
