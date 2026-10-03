import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Protocol
from uuid import UUID

import jwt
from jwt import PyJWKClient
from jwt.exceptions import ExpiredSignatureError, PyJWKClientConnectionError, PyJWTError

from app.core.config import get_settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)

# Asymmetric only. HS256 is deliberately NOT accepted: with a public JWKS it would allow an
# "algorithm confusion" attack (signing a token with the public key as if it were a shared secret).
ALLOWED_ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"
LEEWAY_SECONDS = 10
JWKS_CACHE_SECONDS = 300  # Supabase docs: do not cache the key set for more than 10 minutes.

_WWW_AUTH = {"WWW-Authenticate": "Bearer"}


class SigningKeyProvider(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> Any: ...


@dataclass(frozen=True)
class TokenClaims:
    user_id: UUID
    email: str | None
    expires_at: int  # unix seconds (`exp`); the WebSocket closes itself when it passes


class JwtVerifier:
    def __init__(self, jwks_client: SigningKeyProvider, issuer: str) -> None:
        self._jwks = jwks_client
        self._issuer = issuer

    def verify(self, token: str) -> TokenClaims:
        try:
            signing_key = self._jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=ALLOWED_ALGORITHMS,
                audience=AUDIENCE,
                issuer=self._issuer,
                leeway=LEEWAY_SECONDS,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
            if claims.get("role") != "authenticated":
                raise PyJWTError("token role is not 'authenticated'")
            user_id = UUID(str(claims["sub"]))
        except ExpiredSignatureError:
            raise AppError("TOKEN_EXPIRED", "El token expiró. Renueva la sesión.", 401, headers=_WWW_AUTH)
        except PyJWKClientConnectionError:
            logger.error("JWKS endpoint unreachable")
            raise AppError("UPSTREAM_UNAVAILABLE", "No se pudo validar la sesión. Intenta de nuevo.", 503)
        except (PyJWTError, ValueError) as exc:
            # The reason stays in the log (without the token); the client only gets a generic code.
            logger.info("token rejected: %s", type(exc).__name__)
            raise AppError("INVALID_TOKEN", "Token inválido.", 401, headers=_WWW_AUTH)
        email = claims.get("email")
        return TokenClaims(
            user_id=user_id, email=email if isinstance(email, str) else None, expires_at=int(claims["exp"])
        )


@lru_cache
def get_jwt_verifier() -> JwtVerifier:
    settings = get_settings()
    jwks = PyJWKClient(settings.jwks_url, cache_jwk_set=True, lifespan=JWKS_CACHE_SECONDS, timeout=5)
    return JwtVerifier(jwks, settings.auth_issuer)
