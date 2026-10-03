from fastapi import APIRouter, Depends

from app.api.deps import get_auth_service
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, SessionResponse
from app.schemas.common import ErrorResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=SessionResponse,
    status_code=201,
    summary="Crear cuenta de participante",
    responses={
        409: {"model": ErrorResponse, "description": "EMAIL_ALREADY_REGISTERED"},
        422: {"model": ErrorResponse, "description": "VALIDATION_ERROR / WEAK_PASSWORD / INVALID_EMAIL"},
        403: {"model": ErrorResponse, "description": "EMAIL_CONFIRMATION_REQUIRED / SIGNUP_DISABLED"},
    },
)
def register(body: RegisterRequest, service: AuthService = Depends(get_auth_service)) -> SessionResponse:
    return service.register(body.email, body.password, body.display_name)


@router.post(
    "/login",
    response_model=SessionResponse,
    summary="Iniciar sesión",
    responses={
        401: {"model": ErrorResponse, "description": "INVALID_CREDENTIALS"},
        403: {"model": ErrorResponse, "description": "EMAIL_NOT_CONFIRMED / USER_BANNED"},
        429: {"model": ErrorResponse, "description": "RATE_LIMITED"},
    },
)
def login(body: LoginRequest, service: AuthService = Depends(get_auth_service)) -> SessionResponse:
    return service.login(body.email, body.password)


@router.post(
    "/refresh",
    response_model=SessionResponse,
    summary="Renovar la sesión con el refresh token",
    responses={401: {"model": ErrorResponse, "description": "INVALID_REFRESH_TOKEN"}},
)
def refresh(body: RefreshRequest, service: AuthService = Depends(get_auth_service)) -> SessionResponse:
    return service.refresh(body.refresh_token)
