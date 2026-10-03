from typing import Annotated, Literal
from uuid import UUID

from pydantic import BeforeValidator, Field, StringConstraints

from app.domain.user import UserRole
from app.schemas.common import CamelModel

# Supabase hashes with bcrypt, which only uses the first 72 bytes: longer passwords are refused up front.
MAX_PASSWORD_LENGTH = 72
MIN_PASSWORD_LENGTH = 8


def _normalize_email(value):
    return value.strip().lower() if isinstance(value, str) else value


# BeforeValidator: trim/lowercase first, so the pattern checks the cleaned value.
Email = Annotated[
    str,
    BeforeValidator(_normalize_email),
    StringConstraints(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class RegisterRequest(CamelModel):
    email: Email
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    display_name: DisplayName


class LoginRequest(CamelModel):
    email: Email
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class RefreshRequest(CamelModel):
    refresh_token: str = Field(min_length=1, max_length=2048)


class MeResponse(CamelModel):
    id: UUID
    email: str | None
    display_name: str
    role: UserRole


class SessionResponse(CamelModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: Literal["bearer"] = "bearer"
    user: MeResponse
