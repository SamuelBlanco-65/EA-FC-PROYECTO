"""Open WebSockets, grouped by user. One user may have several (two phones, a reconnect that overlaps)."""
import asyncio
import logging
from collections.abc import Iterable
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import WebSocket

from app.realtime.events import WireMessage, to_wire

logger = logging.getLogger(__name__)

SEND_TIMEOUT_SECONDS = 5.0


@dataclass(eq=False)
class Connection:
    user_id: UUID
    websocket: WebSocket
    # One writer at a time per socket: two tasks sending concurrently could interleave frames.
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ConnectionManager:
    def __init__(self) -> None:
        self._by_user: dict[UUID, set[Connection]] = {}

    def register(self, user_id: UUID, websocket: WebSocket) -> Connection:
        connection = Connection(user_id, websocket)
        self._by_user.setdefault(user_id, set()).add(connection)
        logger.info("ws connected user=%s open=%d", user_id, self.connection_count)
        return connection

    def unregister(self, connection: Connection) -> None:
        sockets = self._by_user.get(connection.user_id)
        if sockets is None or connection not in sockets:
            return
        sockets.discard(connection)
        if not sockets:
            del self._by_user[connection.user_id]
        logger.info("ws disconnected user=%s open=%d", connection.user_id, self.connection_count)

    @property
    def connection_count(self) -> int:
        return sum(len(s) for s in self._by_user.values())

    def is_connected(self, user_id: UUID) -> bool:
        return user_id in self._by_user

    async def send_to_connection(self, connection: Connection, message: WireMessage) -> bool:
        return await self._send(connection, to_wire(message))

    async def send_to_users(self, user_ids: Iterable[UUID], message: WireMessage) -> int:
        """Delivers to every open socket of those users. Offline users are simply skipped: the database is the
        truth and the app re-reads over REST when it reconnects. Returns how many sockets received it."""
        targets = [c for uid in user_ids for c in tuple(self._by_user.get(uid, ()))]
        return await self._send_all(targets, message)

    async def broadcast(self, message: WireMessage) -> int:
        targets = [c for sockets in self._by_user.values() for c in tuple(sockets)]
        return await self._send_all(targets, message)

    async def _send_all(self, targets: list[Connection], message: WireMessage) -> int:
        if not targets:
            return 0
        payload = to_wire(message)
        # Concurrent, each with its own timeout: one stuck phone must not delay everyone else.
        results = await asyncio.gather(*(self._send(c, payload) for c in targets))
        return sum(results)

    async def _send(self, connection: Connection, payload: str) -> bool:
        try:
            async with connection.lock:
                await asyncio.wait_for(connection.websocket.send_text(payload), SEND_TIMEOUT_SECONDS)
            return True
        except Exception as exc:  # closed, reset or too slow: drop that socket, keep serving the rest
            logger.info("ws send failed user=%s reason=%s; dropping it", connection.user_id, type(exc).__name__)
            self.unregister(connection)
            try:
                await connection.websocket.close(code=1011)
            except Exception:
                pass
            return False
