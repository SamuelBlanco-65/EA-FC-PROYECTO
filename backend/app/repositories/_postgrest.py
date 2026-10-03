"""Shared PostgREST error handling for the repositories that read with the USER's JWT."""
import logging

from postgrest.exceptions import APIError

from app.core.errors import AppError

logger = logging.getLogger(__name__)

# PostgREST answers these when it rejects the JWT itself (expired/invalid between our check and its own).
JWT_REJECTED = {"PGRST301", "PGRST302", "PGRST303"}


def upstream_error(exc: APIError, what: str) -> AppError:
    if exc.code in JWT_REJECTED:
        return AppError("INVALID_TOKEN", "Token inválido.", 401, headers={"WWW-Authenticate": "Bearer"})
    logger.error("%s failed: code=%s", what, exc.code)
    return AppError("UPSTREAM_ERROR", f"No se pudo leer {what}.", 502)
