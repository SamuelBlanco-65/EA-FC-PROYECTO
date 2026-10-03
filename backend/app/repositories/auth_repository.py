"""Supabase Auth access (sign up / sign in / refresh).

Client used: PUBLISHABLE key, one fresh client per call (see core/supabase_clients.py). These are
the same public endpoints the user would hit, so no secret key is needed or used here. Upstream
errors are translated to stable AppError codes at this boundary; nothing Supabase-specific leaks up.
"""
import logging
from dataclasses import dataclass
from uuid import UUID

from supabase_auth.errors import (
    AuthApiError,
    AuthError,
    AuthRetryableError,
    AuthWeakPasswordError,
)

from app.core.config import Settings
from app.core.errors import AppError
from app.core.supabase_clients import new_auth_client

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthSession:
    access_token: str
    refresh_token: str
    expires_in: int
    user_id: UUID
    email: str | None


@dataclass(frozen=True)
class SignUpResult:
    user_id: UUID
    session: AuthSession | None  # None when the project requires e-mail confirmation


_BY_CODE: dict[str, tuple[str, str, int]] = {
    "invalid_credentials": ("INVALID_CREDENTIALS", "Correo o contraseña incorrectos.", 401),
    "email_not_confirmed": ("EMAIL_NOT_CONFIRMED", "Debes confirmar tu correo antes de entrar.", 403),
    "user_already_exists": ("EMAIL_ALREADY_REGISTERED", "Ese correo ya está registrado.", 409),
    "email_exists": ("EMAIL_ALREADY_REGISTERED", "Ese correo ya está registrado.", 409),
    "weak_password": ("WEAK_PASSWORD", "La contraseña es demasiado débil.", 422),
    "email_address_invalid": ("INVALID_EMAIL", "El correo no es válido.", 422),
    "signup_disabled": ("SIGNUP_DISABLED", "El registro está deshabilitado.", 403),
    "email_provider_disabled": ("AUTH_PROVIDER_DISABLED", "El acceso con correo y contraseña está deshabilitado.", 503),
    "user_banned":("USER_BANNED", "Esta cuenta está bloqueada.", 403),
    "over_request_rate_limit": ("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429),
    "over_email_send_rate_limit": ("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429),
    "refresh_token_not_found": ("INVALID_REFRESH_TOKEN", "La sesión ya no es válida. Inicia sesión.", 401),
    "refresh_token_already_used": ("INVALID_REFRESH_TOKEN", "La sesión ya no es válida. Inicia sesión.", 401),
    "session_not_found": ("INVALID_REFRESH_TOKEN", "La sesión ya no es válida. Inicia sesión.", 401),
    "session_expired": ("INVALID_REFRESH_TOKEN", "La sesión ya no es válida. Inicia sesión.", 401),
}


_INVALID_REFRESH = _BY_CODE["refresh_token_not_found"]
_INVALID_INPUT = ("INVALID_EMAIL", "El correo o la contraseña no son válidos.", 422)


def translate_auth_error(exc: AuthError, validation_failed: tuple[str, str, int] = _INVALID_INPUT) -> AppError:
    """`validation_failed` is generic in Supabase: what it means depends on the operation (see refresh)."""
    code = getattr(exc, "code", None)
    status = getattr(exc, "status", None)
    if isinstance(exc, AuthWeakPasswordError):
        code = "weak_password"
    mapped = validation_failed if code == "validation_failed" else _BY_CODE.get(code or "")
    if mapped is None and status == 429:
        mapped = _BY_CODE["over_request_rate_limit"]
    if mapped:
        return AppError(mapped[0], mapped[1], mapped[2])
    if isinstance(exc, AuthRetryableError) or (isinstance(status, int) and status >= 500):
        return AppError("UPSTREAM_UNAVAILABLE", "El servicio de autenticación no está disponible.", 503)
    logger.error("unmapped Supabase Auth error: type=%s status=%s code=%s", type(exc).__name__, status, code)
    return AppError("UPSTREAM_ERROR", "No se pudo completar la operación de autenticación.", 502)


def _to_session(session) -> AuthSession:
    return AuthSession(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user_id=UUID(session.user.id),
        email=session.user.email,
    )


class AuthRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def sign_up(self, email: str, password: str, display_name: str) -> SignUpResult:
        try:
            response = new_auth_client(self._settings).auth.sign_up(
                # display_name goes to user_metadata; the DB trigger copies it to profiles.
                # The role is NOT read from metadata (the client controls it): it defaults to participant.
                {"email": email, "password": password, "options": {"data": {"display_name": display_name}}}
            )
        except AuthError as exc:
            raise translate_auth_error(exc) from None
        if response.user is None:
            raise AppError("UPSTREAM_ERROR", "No se pudo crear la cuenta.", 502)
        session = _to_session(response.session) if response.session else None
        return SignUpResult(user_id=UUID(response.user.id), session=session)

    def sign_in(self, email: str, password: str) -> AuthSession:
        try:
            response = new_auth_client(self._settings).auth.sign_in_with_password(
                {"email": email, "password": password}
            )
        except AuthError as exc:
            raise translate_auth_error(exc) from None
        if response.session is None:
            raise AppError("UPSTREAM_ERROR", "No se pudo iniciar sesión.", 502)
        return _to_session(response.session)

    def refresh(self, refresh_token: str) -> AuthSession:
        try:
            response = new_auth_client(self._settings).auth.refresh_session(refresh_token)
        except AuthError as exc:
            # A malformed/unknown refresh token comes back as validation_failed ("Refresh token is not valid").
            raise translate_auth_error(exc, validation_failed=_INVALID_REFRESH) from None
        if response.session is None:
            raise AppError("INVALID_REFRESH_TOKEN", "La sesión ya no es válida. Inicia sesión.", 401)
        return _to_session(response.session)
