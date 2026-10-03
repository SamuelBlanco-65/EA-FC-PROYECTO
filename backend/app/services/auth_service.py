import logging

from app.core.errors import AppError
from app.core.security import JwtVerifier
from app.domain.user import CurrentUser, Profile
from app.repositories.auth_repository import AuthRepository, AuthSession
from app.repositories.profile_repository import ProfileRepository
from app.schemas.auth import MeResponse, SessionResponse

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, auth_repo: AuthRepository, profile_repo: ProfileRepository, verifier: JwtVerifier) -> None:
        self._auth = auth_repo
        self._profiles = profile_repo
        self._verifier = verifier

    def authenticate(self, access_token: str) -> CurrentUser:
        """Token -> CurrentUser. Identity from the signed JWT, role from the DB, never from the client."""
        claims = self._verifier.verify(access_token)
        profile = self._profiles.get_own_profile(claims.user_id, access_token)
        if profile is None:
            raise AppError("PROFILE_NOT_FOUND", "La cuenta no tiene perfil.", 403)
        return CurrentUser(
            id=claims.user_id,
            email=claims.email,
            display_name=profile.display_name,
            role=profile.role,
            access_token=access_token,
            token_expires_at=claims.expires_at,
        )

    def register(self, email: str, password: str, display_name: str) -> SessionResponse:
        result = self._auth.sign_up(email, password, display_name.strip())
        if result.session is None:
            raise AppError(
                "EMAIL_CONFIRMATION_REQUIRED",
                "Cuenta creada. Confirma tu correo y luego inicia sesión.",
                403,
            )
        return self._session_response(result.session)

    def login(self, email: str, password: str) -> SessionResponse:
        return self._session_response(self._auth.sign_in(email, password))

    def refresh(self, refresh_token: str) -> SessionResponse:
        return self._session_response(self._auth.refresh(refresh_token))

    def _session_response(self, session: AuthSession) -> SessionResponse:
        profile: Profile | None = self._profiles.get_own_profile(session.user_id, session.access_token)
        if profile is None:
            logger.error("user %s authenticated but has no profile row", session.user_id)
            raise AppError("PROFILE_NOT_FOUND", "La cuenta no tiene perfil.", 403)
        return SessionResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in,
            user=MeResponse(
                id=session.user_id, email=session.email, display_name=profile.display_name, role=profile.role
            ),
        )
