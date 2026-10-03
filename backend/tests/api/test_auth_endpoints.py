"""/auth/* with a fake Supabase Auth repository (no network). Real-Supabase behaviour: see tests/integration."""
import pytest
from supabase_auth.errors import AuthApiError, AuthRetryableError, AuthWeakPasswordError

from app.api.deps import get_auth_repository
from app.core.errors import AppError
from app.domain.user import UserRole
from app.repositories.auth_repository import AuthSession, SignUpResult, translate_auth_error


class FakeAuthRepo:
    def __init__(self, profiles):
        self.profiles = profiles
        self.require_confirmation = False
        self.fail_with: AppError | None = None

    def _session(self, uid):
        return AuthSession("access-1", "refresh-1", 3600, uid, "ana@example.com")

    def sign_up(self, email, password, display_name):
        if self.fail_with:
            raise self.fail_with
        uid = self.profiles.add(UserRole.PARTICIPANT, display_name)
        return SignUpResult(uid, None if self.require_confirmation else self._session(uid))

    def sign_in(self, email, password):
        if self.fail_with:
            raise self.fail_with
        return self._session(self.profiles.add(UserRole.PARTICIPANT, "Ana"))

    def refresh(self, refresh_token):
        return self._session(self.profiles.add(UserRole.PARTICIPANT, "Ana"))


@pytest.fixture
def repo(app, profiles):
    fake = FakeAuthRepo(profiles)
    app.dependency_overrides[get_auth_repository] = lambda: fake
    return fake


def test_register_returns_201_with_camel_case_session(client, repo):
    response = client.post("/auth/register", json={"email": " Ana@Example.com ", "password": "longenough1", "displayName": "Ana"})
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"accessToken", "refreshToken", "expiresIn", "tokenType", "user"}
    assert body["tokenType"] == "bearer" and body["expiresIn"] == 3600
    assert body["user"]["role"] == "participant" and body["user"]["displayName"] == "Ana"


def test_register_cannot_choose_a_role(client, repo):
    response = client.post("/auth/register", json={
        "email": "a@example.com", "password": "longenough1", "displayName": "Mallory", "role": "admin"})
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "participant"


def test_register_when_email_confirmation_is_required(client, repo):
    repo.require_confirmation = True
    response = client.post("/auth/register", json={"email": "a@example.com", "password": "longenough1", "displayName": "A"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "EMAIL_CONFIRMATION_REQUIRED"


def test_login_ok_and_refresh_ok(client, repo):
    login = client.post("/auth/login", json={"email": "a@example.com", "password": "x"})
    assert login.status_code == 200 and login.json()["accessToken"] == "access-1"
    refresh = client.post("/auth/refresh", json={"refreshToken": "refresh-1"})
    assert refresh.status_code == 200 and refresh.json()["refreshToken"] == "refresh-1"


def test_login_failure_uses_the_standard_error_body(client, repo):
    repo.fail_with = AppError("INVALID_CREDENTIALS", "Correo o contraseña incorrectos.", 401)
    response = client.post("/auth/login", json={"email": "a@example.com", "password": "wrong"})
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "INVALID_CREDENTIALS", "message": "Correo o contraseña incorrectos.", "details": {}}}


@pytest.mark.parametrize("exc, status, code", [
    (AuthApiError("x", 400, "invalid_credentials"), 401, "INVALID_CREDENTIALS"),
    (AuthApiError("x", 400, "email_not_confirmed"), 403, "EMAIL_NOT_CONFIRMED"),
    (AuthApiError("x", 422, "user_already_exists"), 409, "EMAIL_ALREADY_REGISTERED"),
    (AuthApiError("x", 422, "email_exists"), 409, "EMAIL_ALREADY_REGISTERED"),
    (AuthWeakPasswordError("x", 422, ["length"]), 422, "WEAK_PASSWORD"),
    (AuthApiError("x", 400, "refresh_token_not_found"), 401, "INVALID_REFRESH_TOKEN"),
    (AuthApiError("x", 400, "validation_failed"), 422, "INVALID_EMAIL"),
    (AuthApiError("x", 429, None), 429, "RATE_LIMITED"),
    (AuthApiError("x", 422, "email_provider_disabled"), 503, "AUTH_PROVIDER_DISABLED"),
    (AuthApiError("x", 500, "unexpected_failure"), 503, "UPSTREAM_UNAVAILABLE"),
    (AuthRetryableError("x", 0), 503, "UPSTREAM_UNAVAILABLE"),
    (AuthApiError("x", 400, "something_new"), 502, "UPSTREAM_ERROR"),
])
def test_supabase_auth_errors_are_translated_to_stable_codes(exc, status, code):
    error = translate_auth_error(exc)
    assert (error.status, error.code) == (status, code)
    assert "x" not in error.message.split()  # upstream message is never forwarded



def test_validation_failed_on_refresh_means_invalid_refresh_token():
    from app.repositories.auth_repository import _INVALID_REFRESH
    error = translate_auth_error(AuthApiError("x", 400, "validation_failed"), validation_failed=_INVALID_REFRESH)
    assert (error.status, error.code) == (401, "INVALID_REFRESH_TOKEN")
