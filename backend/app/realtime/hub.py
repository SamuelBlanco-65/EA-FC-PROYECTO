"""Wires listener -> dispatcher -> connection manager and owns their background tasks (FastAPI lifespan)."""
import asyncio
import logging

from realtime import AsyncRealtimeClient

from app.core.config import Settings
from app.realtime.audience import MatchAudience
from app.realtime.connection_manager import ConnectionManager
from app.realtime.dispatcher import Dispatcher
from app.realtime.listener import RealtimeListener
from app.repositories.audience_repository import AudienceRepository

logger = logging.getLogger(__name__)


class RealtimeHub:
    def __init__(self, settings: Settings, manager: ConnectionManager) -> None:
        self._audience = MatchAudience(AudienceRepository(settings))
        self._dispatcher = Dispatcher(manager, self._audience)

        def new_client() -> AsyncRealtimeClient:
            # auto_reconnect=False: the listener supervisor owns recovery (see listener.py).
            return AsyncRealtimeClient(
                settings.realtime_url, token=settings.supabase_secret_key.get_secret_value(), auto_reconnect=False
            )

        self._listener = RealtimeListener(new_client, self._dispatcher.submit, self._dispatcher.announce_resync)
        self._tasks: list[asyncio.Task] = []

    @property
    def listener(self) -> RealtimeListener:
        return self._listener

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._dispatcher.run(), name="realtime-dispatcher"),
            asyncio.create_task(self._listener.run(), name="realtime-listener"),
            asyncio.create_task(self._audience.warm(), name="realtime-audience-warmup"),
        ]
        logger.info("realtime hub started")

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
        logger.info("realtime hub stopped")
