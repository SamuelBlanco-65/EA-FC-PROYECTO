from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID


class UserRole(StrEnum):
    PARTICIPANT = "participant"
    ADMIN = "admin"


@dataclass(frozen=True)
class Profile:
    id: UUID
    display_name: str
    role: UserRole


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated caller. id comes from the verified JWT, role from `profiles` (never the client)."""

    id: UUID
    email: str | None
    display_name: str
    role: UserRole
    # Needed later to build a per-request Supabase client under RLS; kept out of repr/logs.
    access_token: str = field(repr=False)
