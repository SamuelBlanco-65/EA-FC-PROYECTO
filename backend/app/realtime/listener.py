"""Supabase Realtime (postgres_changes) listener with its own supervisor.

Why a supervisor instead of the library's `auto_reconnect` (VERIFIED by reading realtime 2.32.0):
it reconnects only after `ConnectionClosedError`; if `connect()` runs out of retries inside its background
task, or the server closes cleanly, the task ends silently and the client looks alive forever. Here the
library reconnect is OFF and this loop owns recovery: poll health, tear everything down, rebuild with
exponential backoff, and after any recovery tell the clients to resync (changes during the gap are lost).
"""
import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from realtime import AsyncRealtimeClient, RealtimePostgresChangesListenEvent, RealtimeSubscribeStates

from app.realtime.translator import Change

logger = logging.getLogger(__name__)

CHANNEL_NAME = "backend-listener"
WATCHED_TABLES = ("matches", "match_events")
SUBSCRIBE_TIMEOUT_SECONDS = 15.0
HEALTH_INTERVAL_SECONDS = 5.0
INITIAL_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0


class ListenerDown(Exception):
    pass


ClientFactory = Callable[[], AsyncRealtimeClient]


class RealtimeListener:
    def __init__(
        self,
        client_factory: ClientFactory,
        on_change: Callable[[Change], None],
        on_resync: Callable[[], Awaitable[None]],
        *,
        health_interval: float = HEALTH_INTERVAL_SECONDS,
        subscribe_timeout: float = SUBSCRIBE_TIMEOUT_SECONDS,
        initial_backoff: float = INITIAL_BACKOFF_SECONDS,
        max_backoff: float = MAX_BACKOFF_SECONDS,
    ) -> None:
        self._client_factory = client_factory
        self._on_change = on_change
        self._on_resync = on_resync
        self._health_interval = health_interval
        self._subscribe_timeout = subscribe_timeout
        self._initial_backoff = initial_backoff
        self._max_backoff = max_backoff
        self.subscribed = False  # observable state: used by tests and logs

    async def run(self) -> None:
        backoff = self._initial_backoff
        attempt = 0
        while True:
            attempt += 1
            client: AsyncRealtimeClient | None = None
            try:
                client = self._client_factory()
                failure = asyncio.Event()
                channel = await self._subscribe(client, failure)
                self.subscribed = True
                backoff = self._initial_backoff
                logger.info("realtime listener subscribed to %s (attempt %d)", ", ".join(WATCHED_TABLES), attempt)
                if attempt > 1:
                    await self._on_resync()  # we may have missed changes while down
                await self._watch(client, channel, failure)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("realtime listener down: %s %s", type(exc).__name__, exc if isinstance(exc, ListenerDown) else "")
            finally:
                self.subscribed = False
                await self._close(client)
            logger.info("realtime listener retrying in %.1fs", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, self._max_backoff)

    async def _subscribe(self, client: AsyncRealtimeClient, failure: asyncio.Event):
        ready = asyncio.Event()
        errors: list[str] = []

        def on_state(state: RealtimeSubscribeStates, err: Exception | None) -> None:
            if state == RealtimeSubscribeStates.SUBSCRIBED:
                ready.set()
            else:
                errors.append(state.value)
                failure.set()
                ready.set()

        channel = client.channel(CHANNEL_NAME)
        for table in WATCHED_TABLES:
            channel.on_postgres_changes(
                RealtimePostgresChangesListenEvent.All, self._handle_payload, table=table, schema="public"
            )
        await channel.subscribe(on_state)
        await asyncio.wait_for(ready.wait(), self._subscribe_timeout)
        if errors:
            raise ListenerDown(f"subscribe failed: {errors[0]}")
        return channel

    def _handle_payload(self, payload: dict[str, Any]) -> None:
        data = payload["data"]
        kind = data["type"]
        self._on_change(Change(table=data["table"], kind=str(getattr(kind, "value", kind)), record=data.get("record")))

    async def _watch(self, client: AsyncRealtimeClient, channel, failure: asyncio.Event) -> None:
        while True:
            try:
                await asyncio.wait_for(failure.wait(), self._health_interval)
            except TimeoutError:
                pass
            if failure.is_set():
                raise ListenerDown("channel reported an error")
            if not client.is_connected or not channel.is_joined:
                raise ListenerDown("client disconnected or channel left")
            ws = getattr(client, "_ws_connection", None)  # private attribute; guarded in case a new version drops it
            state = getattr(ws, "state", None)
            if state is not None and getattr(state, "name", "OPEN") != "OPEN":
                raise ListenerDown(f"websocket is {state.name}")

    @staticmethod
    async def _close(client: AsyncRealtimeClient | None) -> None:
        if client is None:
            return
        try:
            await asyncio.wait_for(client.close(), 5)
        except Exception:
            pass
