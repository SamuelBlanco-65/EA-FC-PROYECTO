from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
_PLACEHOLDERS = ("REPLACE_ME", "YOUR-")


class Settings(BaseSettings):
    # hide_input_in_errors: a bad value must never be echoed in a startup error (it may be a key).
    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    supabase_url: str
    supabase_publishable_key: SecretStr
    # Bypasses RLS: only for admin work and the atomic club assignment, never for plain reads.
    supabase_secret_key: SecretStr
    cors_origins: str = ""
    log_level: str = "INFO"

    @field_validator("supabase_url", "supabase_publishable_key", "supabase_secret_key", mode="after")
    @classmethod
    def _reject_placeholders(cls, value):
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if not raw.strip() or any(p in raw for p in _PLACEHOLDERS):
            raise ValueError("is empty or still a placeholder; fill it in backend/.env")
        return value

    @field_validator("supabase_url", mode="after")
    @classmethod
    def _normalize_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ValueError("must start with https://")
        return value

    @property
    def auth_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.auth_issuer}/.well-known/jwks.json"

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_url}/rest/v1"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
