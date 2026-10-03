import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, health, matches, me, participants, squad, tournament, ws
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging, request_id_var
from app.realtime.connection_manager import ConnectionManager
from app.realtime.hub import RealtimeHub

logger = logging.getLogger("app.request")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    connections = ConnectionManager()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Only runs under a real server (or `with TestClient(app)`), so the hermetic tests never open a socket.
        hub = RealtimeHub(settings, connections) if settings.realtime_listener_enabled else None
        app.state.hub = hub
        if hub is not None:
            hub.start()
        try:
            yield
        finally:
            if hub is not None:
                await hub.stop()

    app = FastAPI(title="EA FC Tournament API", version="0.3.0", lifespan=lifespan)
    app.state.connections = connections
    register_error_handlers(app)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            # Path only (no query string, no headers, no body): nothing secret can end up here.
            logger.info(
                "%s %s -> %s %.1fms user=%s",
                request.method,
                request.url.path,
                status,
                (time.perf_counter() - started) * 1000,
                getattr(request.state, "user_id", "-"),
            )

    # Added last = outermost, so even error responses carry CORS headers. Bearer tokens, no cookies.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(participants.router)
    app.include_router(tournament.router)
    app.include_router(matches.router)
    app.include_router(squad.router)
    app.include_router(admin.router)
    app.include_router(ws.router)
    return app


app = create_app()
