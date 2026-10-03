"""Hermetic fixtures: the REAL JwtVerifier / dependencies run, but the signing key is a local ES256
key (instead of Supabase's JWKS) and profiles live in a dict. No network, no Supabase."""
import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends
from fastapi.testclient import TestClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from app.api.deps import get_profile_repository, require_admin
from app.core.config import get_settings
from app.core.security import JwtVerifier, get_jwt_verifier
from app.domain.user import Profile, UserRole
from app.main import create_app

KID = "test-key-1"


class FakeJwksClient:
    def __init__(self, public_key, kid=KID):
        self.public_key, self.kid, self.unreachable = public_key, kid, False

    def get_signing_key_from_jwt(self, token):
        if self.unreachable:
            raise PyJWKClientConnectionError("jwks down")
        if jwt.get_unverified_header(token).get("kid") != self.kid:
            raise PyJWKClientError("unknown kid")
        return SimpleNamespace(key=self.public_key)


class FakeProfiles:
    def __init__(self):
        self.rows: dict[uuid.UUID, Profile] = {}

    def add(self, role: UserRole, name: str = "Test User") -> uuid.UUID:
        uid = uuid.uuid4()
        self.rows[uid] = Profile(id=uid, display_name=name, role=role)
        return uid

    def get_own_profile(self, user_id, access_token):
        return self.rows.get(user_id)


@pytest.fixture(scope="session")
def private_key():
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def jwks(private_key):
    return FakeJwksClient(private_key.public_key())


@pytest.fixture
def profiles():
    return FakeProfiles()


@pytest.fixture
def make_token(private_key):
    issuer = get_settings().auth_issuer

    def _make(sub, *, role="authenticated", aud="authenticated", iss=None, exp_in=3600, key=None, kid=KID, **extra):
        now = int(time.time())
        payload = {"sub": str(sub), "role": role, "aud": aud, "iss": iss or issuer,
                   "iat": now, "exp": now + exp_in, "email": "u@example.com", **extra}
        return jwt.encode(payload, key or private_key, algorithm="ES256", headers={"kid": kid})

    return _make


@pytest.fixture
def app(jwks, profiles):
    app = create_app()
    app.dependency_overrides[get_jwt_verifier] = lambda: JwtVerifier(jwks, get_settings().auth_issuer)
    app.dependency_overrides[get_profile_repository] = lambda: profiles

    # Throwaway route so require_admin can be exercised without shipping an admin-only endpoint yet.
    @app.get("/_test/admin-only")
    def admin_only(user=Depends(require_admin)):
        return {"id": str(user.id), "role": user.role}

    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def auth_header():
    return lambda token: {"Authorization": f"Bearer {token}"}

