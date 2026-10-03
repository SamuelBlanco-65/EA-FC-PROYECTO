"""Smoke test of a deployed backend, run from your PC: /health over HTTPS and /ws over wss.

Step 3 (login + AUTH_OK + PING/PONG) needs a participant password (DEMO_PARTICIPANT_PASSWORD, same source as
the demo scripts). Without it, steps 1-2 still prove TLS, the WebSocket upgrade and the app's own auth gate.

Run (PowerShell, repo root):
    backend\\venv\\Scripts\\python.exe scripts\\deploy\\check_deploy.py https://ea-fc-api.onrender.com
    backend\\venv\\Scripts\\python.exe scripts\\deploy\\check_deploy.py https://ea-fc-api.onrender.com --email participant01@example.com
"""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo"))
from _common import error_code, fail, participant_email, password_for, say, ws_url  # noqa: E402

COLD_START_TIMEOUT = 120  # a sleeping Render free service takes ~1 min to answer the first request
WS_TIMEOUT = 15


def check_health(base: str) -> None:
    started = time.perf_counter()
    try:
        r = httpx.get(f"{base}/health", timeout=COLD_START_TIMEOUT)
    except httpx.HTTPError as exc:
        fail(f"GET /health failed: {type(exc).__name__}")
    took = time.perf_counter() - started
    if r.status_code != 200 or r.json() != {"status": "ok"}:
        fail(f"GET /health -> {r.status_code} {r.text[:120]}")
    note = "  (cold start: the service was asleep)" if took > 10 else ""
    say("health", f"OK {r.status_code} in {took:.1f}s over {r.url.scheme.upper()}{note}")
    started = time.perf_counter()
    httpx.get(f"{base}/health", timeout=15)
    say("health", f"second request: {(time.perf_counter() - started) * 1000:.0f} ms (warm)")


async def check_ws_auth_gate(url: str) -> None:
    """No AUTH message: the server must accept the upgrade and answer AUTH_ERROR/AUTH_REQUIRED.

    The notice is a data frame on purpose: Render's proxy does not deliver the close frame (4401), so the
    script does not wait for it."""
    async with connect(url, open_timeout=WS_TIMEOUT) as ws:
        await ws.send(json.dumps({"type": "HELLO"}))
        try:
            notice = json.loads(await asyncio.wait_for(ws.recv(), WS_TIMEOUT))
        except ConnectionClosed as closed:
            fail(f"closed without an AUTH_ERROR notice: {closed.rcvd}")
        except TimeoutError:
            fail("no AUTH_ERROR within the timeout: the server kept an unauthenticated socket silent")
    if notice != {"type": "AUTH_ERROR", "code": "AUTH_REQUIRED"}:
        fail(f"unexpected answer to an anonymous client: {notice}")
    say("wss", "upgrade OK, anonymous client got AUTH_ERROR AUTH_REQUIRED (expected)")


async def check_ws_session(base: str, url: str, email: str) -> None:
    password = password_for("DEMO_PARTICIPANT_PASSWORD")
    async with httpx.AsyncClient(base_url=base, timeout=30) as http:
        r = await http.post("/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        fail(f"login failed for {email}: {error_code(r)}")
    token = r.json()["accessToken"]
    async with connect(url, open_timeout=WS_TIMEOUT) as ws:
        await ws.send(json.dumps({"type": "AUTH", "token": token}))
        hello = json.loads(await asyncio.wait_for(ws.recv(), WS_TIMEOUT))
        if hello.get("type") != "AUTH_OK":
            fail(f"expected AUTH_OK, got {hello.get('type')}")
        say("wss", "AUTH_OK received")
        started = time.perf_counter()
        await ws.send(json.dumps({"type": "PING"}))
        pong = json.loads(await asyncio.wait_for(ws.recv(), WS_TIMEOUT))
        if pong.get("type") != "PONG":
            fail(f"expected PONG, got {pong.get('type')}")
        say("wss", f"PING -> PONG in {(time.perf_counter() - started) * 1000:.0f} ms")


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test of a deployed backend (/health + wss /ws).")
    parser.add_argument("url", help="public base URL, e.g. https://ea-fc-api.onrender.com")
    parser.add_argument("--email", default=participant_email(1), help="participant used for the authenticated step")
    parser.add_argument("--skip-login", action="store_true", help="only steps 1-2 (no password needed)")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    if not base.startswith("https://") and "localhost" not in base and "127.0.0.1" not in base:
        fail("use the https:// URL: this script exists to prove TLS")
    url = ws_url(base)
    say("deploy", f"target {base}  ({url})")
    check_health(base)
    asyncio.run(check_ws_auth_gate(url))
    if not args.skip_login:
        asyncio.run(check_ws_session(base, url, args.email))
    say("deploy", "ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
