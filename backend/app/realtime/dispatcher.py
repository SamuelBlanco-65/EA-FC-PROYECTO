"""Change -> notification -> the right sockets. Changes are processed ONE AT A TIME, in arrival order, so a
client never sees MATCH_CONFIRMED before the MATCH_RESULT_PENDING that preceded it."""
import asyncio
import logging
from collections import OrderedDict
from typing import Protocol
from uuid import UUID

from app.realtime.connection_manager import ConnectionManager
from app.realtime.events import ResyncRequired
from app.realtime.translator import Change, Notification, translate

logger = logging.getLogger(__name__)

QUEUE_SIZE = 5000
_REMEMBERED_KEYS = 500


class AudienceLookup(Protocol):
    def observe(self, change: Change) -> None: ...

    async def users(self, match_id: UUID) -> frozenset[UUID]: ...


class Dispatcher:
    def __init__(self, manager: ConnectionManager, audience: AudienceLookup, queue_size: int = QUEUE_SIZE) -> None:
        self._manager = manager
        self._audience = audience
        self._queue: asyncio.Queue[Change] = asyncio.Queue(maxsize=queue_size)
        self._seen: OrderedDict[str, None] = OrderedDict()

    def submit(self, change: Change) -> None:
        """Called from the Realtime callback (synchronous). Never blocks."""
        try:
            self._queue.put_nowait(change)
        except asyncio.QueueFull:
            # Only a flood gets here. The database still has the truth and clients refetch on RESYNC/reconnect.
            logger.error("dispatcher queue full; dropped a %s %s change", change.table, change.kind)

    async def run(self) -> None:
        while True:
            change = await self._queue.get()
            try:
                await self.dispatch(change)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # one bad change must not stop the loop
                logger.error("could not dispatch a %s %s change: %s", change.table, change.kind, type(exc).__name__)
            finally:
                self._queue.task_done()

    async def dispatch(self, change: Change) -> None:
        self._audience.observe(change)  # learn the match's participants from the row itself
        for notification in translate(change):
            if self._already_sent(notification):
                continue
            await self._deliver(notification)

    async def announce_resync(self) -> None:
        sent = await self._manager.broadcast(ResyncRequired())
        logger.info("RESYNC_REQUIRED sent to %d sockets", sent)

    def _already_sent(self, notification: Notification) -> bool:
        key = notification.dedup_key
        if key is None:
            return False
        if key in self._seen:
            return True
        self._seen[key] = None
        if len(self._seen) > _REMEMBERED_KEYS:
            self._seen.popitem(last=False)
        return False

    async def _deliver(self, notification: Notification) -> None:
        message = notification.message
        if notification.match_id is None:
            sent = await self._manager.broadcast(message)
        else:
            users = await self._audience.users(notification.match_id)
            sent = await self._manager.send_to_users(users, message)
        logger.info("%s -> %d sockets", message.type, sent)
