from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import JwtVerifier, get_jwt_verifier
from app.domain.user import CurrentUser, UserRole
from app.repositories.auth_repository import AuthRepository
from app.repositories.profile_repository import ProfileRepository
from app.services.auth_service import AuthService

# auto_error=False: a missing header must produce OUR error body (401), not FastAPI's default 403.
bearer_scheme = HTTPBearer(auto_error=False, description="Access token devuelto por /auth/login")


def get_auth_repository(settings: Settings = Depends(get_settings)) -> AuthRepository:
    return AuthRepository(settings)


def get_profile_repository(settings: Settings = Depends(get_settings)) -> ProfileRepository:
    return ProfileRepository(settings)


def get_auth_service(
    auth_repo: AuthRepository = Depends(get_auth_repository),
    profile_repo: ProfileRepository = Depends(get_profile_repository),
    verifier: JwtVerifier = Depends(get_jwt_verifier),
) -> AuthService:
    return AuthService(auth_repo, profile_repo, verifier)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    service: AuthService = Depends(get_auth_service),
) -> CurrentUser:
    if credentials is None:
        raise AppError(
            "NOT_AUTHENTICATED", "Falta el token de acceso.", 401, headers={"WWW-Authenticate": "Bearer"}
        )
    user = service.authenticate(credentials.credentials)
    request.state.user_id = str(user.id)  # read by the request-log middleware
    return user


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != UserRole.ADMIN:
        raise AppError("FORBIDDEN", "Requiere rol de administrador.", 403)
    return user
