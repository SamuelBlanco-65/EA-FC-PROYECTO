import base64
import hashlib
import hmac
import json
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.core.config import get_settings
from app.domain.user import UserRole


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and "details" in body["error"]


# ---- the four cases required by the phase ------------------------------------------------------

def test_no_token_returns_401(client):
    response = client.get("/me")
    assert_error(response, 401, "NOT_AUTHENTICATED")
    assert response.headers["www-authenticate"] == "Bearer"


def test_invalid_token_returns_401(client, auth_header):
    assert_error(client.get("/me", headers=auth_header("not-a-jwt")), 401, "INVALID_TOKEN")


def test_participant_on_admin_route_returns_403(client, profiles, make_token, auth_header):
    token = make_token(profiles.add(UserRole.PARTICIPANT))
    assert_error(client.get("/_test/admin-only", headers=auth_header(token)), 403, "FORBIDDEN")


def test_admin_on_admin_route_returns_200(client, profiles, make_token, auth_header):
    uid = profiles.add(UserRole.ADMIN)
    response = client.get("/_test/admin-only", headers=auth_header(make_token(uid)))
    assert response.status_code == 200
    assert response.json() == {"id": str(uid), "role": "admin"}


# ---- /me and the role source -------------------------------------------------------------------

def test_me_returns_profile_in_camel_case(client, profiles, make_token, auth_header):
    uid = profiles.add(UserRole.PARTICIPANT, "Ana")
    response = client.get("/me", headers=auth_header(make_token(uid)))
    assert response.status_code == 200
    assert response.json() == {"id": str(uid), "email": "u@example.com", "displayName": "Ana", "role": "participant"}


def test_role_claims_inside_the_token_are_ignored(client, profiles, make_token, auth_header):
    # The client controls token metadata; only the `profiles` table decides the role.
    uid = profiles.add(UserRole.PARTICIPANT)
    token = make_token(uid, user_metadata={"role": "admin"}, app_metadata={"role": "admin"}, user_role="admin")
    assert_error(client.get("/_test/admin-only", headers=auth_header(token)), 403, "FORBIDDEN")


def test_valid_token_without_profile_returns_403(client, make_token, auth_header):
    assert_error(client.get("/me", headers=auth_header(make_token(uuid.uuid4()))), 403, "PROFILE_NOT_FOUND")


# ---- token validation edge cases ---------------------------------------------------------------

def test_expired_token_has_its_own_code(client, profiles, make_token, auth_header):
    token = make_token(profiles.add(UserRole.PARTICIPANT), exp_in=-3600)
    assert_error(client.get("/me", headers=auth_header(token)), 401, "TOKEN_EXPIRED")


def test_token_signed_with_another_key_is_rejected(client, profiles, make_token, auth_header):
    forged = make_token(profiles.add(UserRole.ADMIN), key=ec.generate_private_key(ec.SECP256R1()))
    assert_error(client.get("/me", headers=auth_header(forged)), 401, "INVALID_TOKEN")


def test_unknown_key_id_is_rejected(client, profiles, make_token, auth_header):
    token = make_token(profiles.add(UserRole.ADMIN), kid="someone-elses-key")
    assert_error(client.get("/me", headers=auth_header(token)), 401, "INVALID_TOKEN")


def test_wrong_issuer_is_rejected(client, profiles, make_token, auth_header):
    token = make_token(profiles.add(UserRole.ADMIN), iss="https://evil.example/auth/v1")
    assert_error(client.get("/me", headers=auth_header(token)), 401, "INVALID_TOKEN")


def test_wrong_audience_is_rejected(client, profiles, make_token, auth_header):
    token = make_token(profiles.add(UserRole.ADMIN), aud="something-else")
    assert_error(client.get("/me", headers=auth_header(token)), 401, "INVALID_TOKEN")


def test_non_authenticated_role_claim_is_rejected(client, profiles, make_token, auth_header):
    token = make_token(profiles.add(UserRole.ADMIN), role="anon")
    assert_error(client.get("/me", headers=auth_header(token)), 401, "INVALID_TOKEN")


def test_token_without_expiry_is_rejected(client, profiles, private_key, auth_header):
    token = jwt.encode(
        {"sub": str(profiles.add(UserRole.ADMIN)), "role": "authenticated", "aud": "authenticated",
         "iss": get_settings().auth_issuer},
        private_key, algorithm="ES256", headers={"kid": "test-key-1"})
    assert_error(client.get("/me", headers=auth_header(token)), 401, "INVALID_TOKEN")


def test_hs256_token_signed_with_the_public_key_is_rejected(client, profiles, private_key, auth_header):
    # Algorithm-confusion attack: HS256 using the (public) key bytes as the HMAC secret.
    # PyJWT refuses to build this token itself, so it is assembled by hand.
    public_pem = private_key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)

    def b64(data: bytes) -> bytes:
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    header = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": "test-key-1"}).encode())
    payload = b64(json.dumps({
        "sub": str(profiles.add(UserRole.ADMIN)), "role": "authenticated", "aud": "authenticated",
        "iss": get_settings().auth_issuer, "exp": int(time.time()) + 3600}).encode())
    signature = b64(hmac.new(public_pem, header + b"." + payload, hashlib.sha256).digest())
    forged = (header + b"." + payload + b"." + signature).decode()
    assert_error(client.get("/me", headers=auth_header(forged)), 401, "INVALID_TOKEN")


def test_unsigned_alg_none_token_is_rejected(client, profiles, auth_header):
    now = int(time.time())
    forged = jwt.encode(
        {"sub": str(profiles.add(UserRole.ADMIN)), "role": "authenticated", "aud": "authenticated",
         "iss": get_settings().auth_issuer, "exp": now + 3600},
        None, algorithm="none", headers={"kid": "test-key-1"})
    assert_error(client.get("/me", headers=auth_header(forged)), 401, "INVALID_TOKEN")


def test_non_bearer_scheme_is_treated_as_missing(client):
    assert_error(client.get("/me", headers={"Authorization": "Basic abc"}), 401, "NOT_AUTHENTICATED")


def test_jwks_unreachable_returns_503_not_401(client, jwks, profiles, make_token, auth_header):
    jwks.unreachable = True
    token = make_token(profiles.add(UserRole.PARTICIPANT))
    assert_error(client.get("/me", headers=auth_header(token)), 503, "UPSTREAM_UNAVAILABLE")


# ---- cross-cutting -----------------------------------------------------------------------------

def test_unknown_route_uses_standard_error_body(client):
    assert_error(client.get("/does-not-exist"), 404, "NOT_FOUND")


def test_every_response_carries_a_request_id(client):
    assert client.get("/health").headers["x-request-id"]
    assert client.get("/me").headers["x-request-id"]


def test_logs_never_contain_the_token(client, profiles, make_token, auth_header, caplog):
    token = make_token(profiles.add(UserRole.PARTICIPANT))
    with caplog.at_level("DEBUG"):
        client.get("/me", headers=auth_header(token))
        client.get("/me", headers=auth_header(token + "x"))
    assert token not in caplog.text
    assert any("user=" in r.getMessage() for r in caplog.records)


def test_swagger_documents_every_route(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/auth/register", "/auth/login", "/auth/refresh", "/me", "/health"} <= set(paths)
    assert client.get("/docs").status_code == 200


@pytest.mark.parametrize("secret", ["hunter2hunter2", "sb_secret_abcdefghijk"])
def test_validation_errors_do_not_echo_input(client, secret):
    response = client.post("/auth/login", json={"email": "not-an-email", "password": secret})
    assert_error(response, 422, "VALIDATION_ERROR")
    assert secret not in response.text
