"""/ws through the real ASGI stack (real JwtVerifier, local signing key, in-memory profiles). No Supabase."""
import json
import uuid

import pytest
from starlette.websockets import WebSocketDisconnect

from app.domain.user import UserRole
from app.realtime.events import MatchConfirmed, MatchResultPending


def auth_msg(token):
    return json.dumps({"type": "AUTH", "token": token})


def expect_close(ws):
    """The server announces the failure as an AUTH_ERROR data frame, then closes with code + the same reason."""
    notice = ws.receive_json()
    assert notice["type"] == "AUTH_ERROR"
    with pytest.raises(WebSocketDisconnect) as exc:
        ws.receive_text()
    assert notice["code"] == exc.value.reason
    return exc.value.code, exc.value.reason


@pytest.fixture
def user(profiles, make_token):
    uid = profiles.add(UserRole.PARTICIPANT, "Ws User")
    return uid, make_token(uid)


def test_valid_auth_message_is_acknowledged(client, user):
    uid, token = user
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(token))
        assert ws.receive_json() == {"type": "AUTH_OK", "userId": str(uid)}


def test_token_in_the_url_is_not_accepted_as_authentication(client, user):
    _, token = user
    with client.websocket_connect(f"/ws?token={token}") as ws:
        ws.send_text(json.dumps({"type": "HELLO"}))
        assert expect_close(ws) == (4401, "AUTH_REQUIRED")


@pytest.mark.parametrize(
    "first_message",
    ["not json", "[]", '{"type":"AUTH"}', '{"type":"AUTH","token":""}', '{"type":"AUTH","token":123}',
     '{"type":"PING"}', "x" * 9000],
)
def test_anything_but_a_well_formed_auth_message_closes_with_4401(client, first_message):
    with client.websocket_connect("/ws") as ws:
        ws.send_text(first_message)
        assert expect_close(ws) == (4401, "AUTH_REQUIRED")


def test_binary_first_frame_is_rejected(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_bytes(b"\x00\x01")
        assert expect_close(ws) == (4401, "AUTH_REQUIRED")


def test_garbage_token_is_rejected(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg("not.a.jwt"))
        assert expect_close(ws) == (4401, "INVALID_TOKEN")


def test_token_signed_with_another_key_is_rejected(client, profiles, make_token):
    from cryptography.hazmat.primitives.asymmetric import ec

    uid = profiles.add(UserRole.PARTICIPANT)
    forged = make_token(uid, key=ec.generate_private_key(ec.SECP256R1()))
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(forged))
        assert expect_close(ws) == (4401, "INVALID_TOKEN")


def test_expired_token_is_rejected(client, profiles, make_token):
    uid = profiles.add(UserRole.PARTICIPANT)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(make_token(uid, exp_in=-60)))
        assert expect_close(ws) == (4401, "TOKEN_EXPIRED")


def test_valid_token_without_profile_is_rejected(client, make_token):
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(make_token(uuid.uuid4())))
        assert expect_close(ws) == (4401, "PROFILE_NOT_FOUND")


def test_jwks_outage_asks_to_retry_instead_of_rejecting(client, user, jwks):
    jwks.unreachable = True
    _, token = user
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(token))
        assert expect_close(ws) == (1013, "UPSTREAM_UNAVAILABLE")


def test_silence_for_5_seconds_closes_the_socket(client, monkeypatch):
    monkeypatch.setattr("app.api.ws.AUTH_TIMEOUT_SECONDS", 0.3)
    with client.websocket_connect("/ws") as ws:
        assert expect_close(ws) == (4401, "AUTH_TIMEOUT")


def test_ping_gets_pong_and_other_messages_are_ignored(client, user):
    _, token = user
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(token))
        ws.receive_json()
        ws.send_text("garbage")
        ws.send_text(json.dumps({"type": "SOMETHING_ELSE"}))
        ws.send_text(json.dumps({"type": "PING"}))
        assert ws.receive_json() == {"type": "PONG"}


def test_socket_closes_itself_when_the_token_expires(client, profiles, make_token):
    uid = profiles.add(UserRole.PARTICIPANT)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(auth_msg(make_token(uid, exp_in=1)))  # JWT leeway is 10 s, so 1 s ahead still authenticates
        assert ws.receive_json()["type"] == "AUTH_OK"
        assert expect_close(ws) == (4401, "TOKEN_EXPIRED")


def test_pushed_messages_reach_only_the_addressed_users(app, client, profiles, make_token):
    """Real sockets + real ConnectionManager: the route below runs on the same event loop as /ws."""
    a, b, c = (profiles.add(UserRole.PARTICIPANT, n) for n in "abc")
    match_id = uuid.uuid4()
    manager = app.state.connections

    @app.post("/_test/push")
    async def push():
        pending = await manager.send_to_users([a, b], MatchResultPending(match_id=match_id, home_score=2, away_score=1))
        everyone = await manager.broadcast(MatchConfirmed(match_id=match_id, home_score=2, away_score=1))
        return {"pending": pending, "everyone": everyone}

    sockets = {}
    with client.websocket_connect("/ws") as wa, client.websocket_connect("/ws") as wb, client.websocket_connect("/ws") as wc:
        for name, ws, uid in (("a", wa, a), ("b", wb, b), ("c", wc, c)):
            ws.send_text(auth_msg(make_token(uid)))
            assert ws.receive_json()["type"] == "AUTH_OK"
            sockets[name] = ws
        assert manager.connection_count == 3

        assert client.post("/_test/push").json() == {"pending": 2, "everyone": 3}

        assert wa.receive_json() == {"type": "MATCH_RESULT_PENDING", "matchId": str(match_id), "homeScore": 2, "awayScore": 1}
        assert wb.receive_json()["type"] == "MATCH_RESULT_PENDING"
        for ws in (wa, wb, wc):  # c never saw the first one: its next frame is the global one
            assert ws.receive_json()["type"] == "MATCH_CONFIRMED"
    assert manager.connection_count == 0  # unregistered on disconnect
