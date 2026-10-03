"""Auth against the REAL Supabase project (real JWKS, real Auth, real `profiles` + RLS).

Creates temporary users (unique tag) and deletes them at the end.
Skip with: python -m pytest -m "not integration"
"""
import secrets
import uuid

import pytest
from dotenv import dotenv_values
from fastapi import Depends
from fastapi.testclient import TestClient
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

from app.api.deps import require_admin
from app.core.config import ENV_PATH
from app.main import create_app

pytestmark = pytest.mark.integration

PASSWORD_PREFIX = "It!"


@pytest.fixture(scope="module")
def secret_client():
    values = dotenv_values(ENV_PATH)
    url, key = (values.get("SUPABASE_URL") or ""), (values.get("SUPABASE_SECRET_KEY") or "")
    if not url or not key or "REPLACE_ME" in key or "YOUR-" in url:
        pytest.skip("backend/.env has no real SUPABASE_URL / SUPABASE_SECRET_KEY")
    return create_client(url, key, SyncClientOptions(auto_refresh_token=False, persist_session=False))


@pytest.fixture(scope="module")
def client():
    app = create_app()

    @app.get("/_test/admin-only")
    def admin_only(user=Depends(require_admin)):
        return {"role": user.role}

    return TestClient(app)


@pytest.fixture
def make_user(secret_client):
    created: list[str] = []

    def _make(label: str):
        tag = uuid.uuid4().hex[:8]
        email = f"it-{label}-{tag}@example.com"
        password = PASSWORD_PREFIX + secrets.token_urlsafe(14)
        resp = secret_client.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True,
             "user_metadata": {"display_name": f"IT {label} {tag}"}})
        created.append(resp.user.id)
        return resp.user.id, email, password

    yield _make
    for user_id in created:
        secret_client.auth.admin.delete_user(user_id)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_then_me_with_a_real_token(client, make_user):
    user_id, email, password = make_user("participant")
    response = login(client, email, password)
    assert response.status_code == 200, response.text
    session = response.json()
    assert session["tokenType"] == "bearer" and session["expiresIn"] > 0
    assert session["user"] == {"id": user_id, "email": email, "displayName": session["user"]["displayName"],
                               "role": "participant"}

    me = client.get("/me", headers=bearer(session["accessToken"]))
    assert me.status_code == 200, me.text
    assert me.json() == session["user"]


def test_wrong_password_and_unknown_user_look_the_same(client, make_user):
    _, email, _ = make_user("participant")
    wrong = login(client, email, "definitely-wrong-1")
    unknown = login(client, f"nobody-{uuid.uuid4().hex[:8]}@example.com", "definitely-wrong-1")
    for response in (wrong, unknown):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert wrong.json() == unknown.json()  # no user enumeration


def test_refresh_issues_a_working_session_and_garbage_is_rejected(client, make_user):
    _, email, password = make_user("participant")
    first = login(client, email, password).json()
    refreshed = client.post("/auth/refresh", json={"refreshToken": first["refreshToken"]})
    assert refreshed.status_code == 200, refreshed.text
    assert client.get("/me", headers=bearer(refreshed.json()["accessToken"])).status_code == 200

    bad = client.post("/auth/refresh", json={"refreshToken": "not-a-real-refresh-token"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"


def delete_by_email(secret_client, email):
    for user in secret_client.auth.admin.list_users(page=1, per_page=200):
        if (user.email or "").lower() == email:
            secret_client.auth.admin.delete_user(user.id)


def test_register_real_supabase(client, secret_client):
    """Outcome depends on the project's e-mail settings, so each real outcome is asserted separately."""
    email = f"it-register-{uuid.uuid4().hex[:8]}@example.com"
    body = {"email": email, "password": PASSWORD_PREFIX + secrets.token_urlsafe(14), "displayName": "  Registered  ",
            "role": "admin"}  # extra field: must be ignored
    try:
        response = client.post("/auth/register", json=body)
        code = response.json().get("error", {}).get("code")
        if response.status_code == 429:
            pytest.skip("Supabase e-mail rate limit hit (sign-up sends a confirmation e-mail): RATE_LIMITED mapped correctly")
        if response.status_code == 403:
            assert code == "EMAIL_CONFIRMATION_REQUIRED"  # project requires confirmation: user created, no session
            return
        assert response.status_code == 201, response.text
        user = response.json()["user"]
        assert user["role"] == "participant" and user["displayName"] == "Registered"
        assert client.get("/me", headers=bearer(response.json()["accessToken"])).status_code == 200
        duplicate = client.post("/auth/register", json=body)
        assert duplicate.status_code == 409, duplicate.text
        assert duplicate.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"
    finally:
        delete_by_email(secret_client, email)


def test_participant_gets_403_and_admin_gets_200_with_real_tokens(client, make_user, secret_client):
    user_id, email, password = make_user("admin-candidate")
    token = login(client, email, password).json()["accessToken"]

    assert client.get("/_test/admin-only", headers=bearer(token)).status_code == 403

    # Promote in the DB: the SAME token now works, proving the role is read from `profiles` per request.
    secret_client.table("profiles").update({"role": "admin"}).eq("id", user_id).execute()
    admin = client.get("/_test/admin-only", headers=bearer(token))
    assert admin.status_code == 200, admin.text
    assert admin.json() == {"role": "admin"}


def test_tampered_real_token_is_rejected(client, make_user):
    _, email, password = make_user("participant")
    token = login(client, email, password).json()["accessToken"]
    header, payload, signature = token.split(".")
    flipped = signature[:-2] + ("AA" if not signature.endswith("AA") else "BB")
    response = client.get("/me", headers=bearer(f"{header}.{payload}.{flipped}"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"
