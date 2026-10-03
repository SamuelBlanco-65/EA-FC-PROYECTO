"""`/ws`: server -> client notifications. The first message must be {"type":"AUTH","token":"<access token>"}.

The token travels in a message, not in the URL: URLs end up in proxy and server logs.
Close codes (application range 4000-4999): 4401 = not authenticated (the close reason is a stable code the
app can switch on: AUTH_TIMEOUT, AUTH_REQUIRED, INVALID_TOKEN, TOKEN_EXPIRED, PROFILE_NOT_FOUND).
1013 = "try again later" (Supabase unreachable while validating).
"""
import asyncio
import json
import logging
import time

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.requests import HTTPConnection

from app.api.deps import get_auth_service
from app.core.errors import AppError
from app.domain.user import CurrentUser
from app.realtime.connection_manager import ConnectionManager
from app.realtime.events import AuthOk, Pong
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])

AUTH_TIMEOUT_SECONDS = 5.0
MAX_MESSAGE_CHARS = 8192  # a JWT is ~1 KB; anything much larger is not a client of ours

CLOSE_UNAUTHENTICATED = 4401
CLOSE_TRY_AGAIN_LATER = 1013


def get_connection_manager(connection: HTTPConnection) -> ConnectionManager:
    return connection.app.state.connections


@router.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    auth: AuthService = Depends(get_auth_service),
    manager: ConnectionManager = Depends(get_connection_manager),
) -> None:
    await websocket.accept()
    user = await _handshake(websocket, auth)
    if user is None:
        return
    connection = manager.register(user.id, websocket)
    try:
        await manager.send_to_connection(connection, AuthOk(user_id=user.id))
        await _serve(websocket, manager, connection, user)
    finally:
        manager.unregister(connection)


async def _handshake(websocket: WebSocket, auth: AuthService) -> CurrentUser | None:
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), AUTH_TIMEOUT_SECONDS)
    except TimeoutError:
        await _close(websocket, CLOSE_UNAUTHENTICATED, "AUTH_TIMEOUT")
        return None
    except WebSocketDisconnect:
        return None
    except Exception:  # binary frame or a broken stream
        await _close(websocket, CLOSE_UNAUTHENTICATED, "AUTH_REQUIRED")
        return None

    token = _parse_auth(raw)
    if token is None:
        await _close(websocket, CLOSE_UNAUTHENTICATED, "AUTH_REQUIRED")
        return None
    try:
        # Sync code (JWKS fetch + profile lookup over HTTP): off the event loop so other sockets keep moving.
        return await asyncio.to_thread(auth.authenticate, token)
    except AppError as exc:
        if exc.status == 503:
            await _close(websocket, CLOSE_TRY_AGAIN_LATER, exc.code)
        else:
            await _close(websocket, CLOSE_UNAUTHENTICATED, exc.code)
        return None


def _parse_auth(raw: str) -> str | None:
    if len(raw) > MAX_MESSAGE_CHARS:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("type") != "AUTH":
        return None
    token = data.get("token")
    return token if isinstance(token, str) and token else None


async def _serve(websocket: WebSocket, manager: ConnectionManager, connection, user: CurrentUser) -> None:
    """Receive loop. The only thing a client may send after AUTH is {"type":"PING"}; everything else is ignored.
    The socket lives as long as the token: when it expires the app refreshes it and reconnects."""
    while True:
        remaining = (user.token_expires_at or 0) - time.time()
        if remaining <= 0:
            await _close(websocket, CLOSE_UNAUTHENTICATED, "TOKEN_EXPIRED")
            return
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), remaining)
        except TimeoutError:
            await _close(websocket, CLOSE_UNAUTHENTICATED, "TOKEN_EXPIRED")
            return
        except WebSocketDisconnect:
            return
        except Exception:
            return
        if len(raw) <= MAX_MESSAGE_CHARS and _is_ping(raw):
            await manager.send_to_connection(connection, Pong())


def _is_ping(raw: str) -> bool:
    try:
        data = json.loads(raw)
    except ValueError:
        return False
    return isinstance(data, dict) and data.get("type") == "PING"


async def _close(websocket: WebSocket, code: int, reason: str) -> None:
    try:
        await websocket.close(code=code, reason=reason)
    except Exception:
        pass  # already closed by the peer
