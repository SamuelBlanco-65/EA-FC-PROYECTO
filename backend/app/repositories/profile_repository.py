"""Reads `profiles` through PostgREST.

Client used: the USER'S OWN JWT (role=authenticated), so RLS applies: the policy
`profiles_select_own` only lets a user see their own row. The backend therefore needs no secret
key to authenticate a request, and a bug here cannot leak other users' profiles.
"""
import logging
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.supabase_clients import user_postgrest
from app.domain.user import Profile, UserRole

logger = logging.getLogger(__name__)

# PostgREST answers these when it rejects the JWT itself (expired/invalid between our check and its own).
_JWT_REJECTED = {"PGRST301", "PGRST302", "PGRST303"}


class ProfileRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get_own_profile(self, user_id: UUID, access_token: str) -> Profile | None:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("profiles")
                .select("id,display_name,role")
                .eq("id", str(user_id))
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            if exc.code in _JWT_REJECTED:
                raise AppError("INVALID_TOKEN", "Token inválido.", 401, headers={"WWW-Authenticate": "Bearer"}) from None
            logger.error("profiles query failed: code=%s", exc.code)
            raise AppError("UPSTREAM_ERROR", "No se pudo leer el perfil.", 502) from None
        if not rows:
            return None
        row = rows[0]
        return Profile(id=UUID(row["id"]), display_name=row["display_name"], role=UserRole(row["role"]))
