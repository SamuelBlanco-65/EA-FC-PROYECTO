"""Phase 6 end to end: real uvicorn + real Supabase Realtime + real WebSocket clients.

The whole chain: HTTP mutation -> Postgres -> Supabase Realtime (postgres_changes) -> backend listener ->
dispatcher -> /ws -> client. Proves what the hermetic tests cannot: that the SECRET key receives every row
despite RLS, that the replication publication is configured, and the real latency.
Creates 3 players + 1 admin + 1 tournament; deletes them in `finally`. Skip with -m "not integration".
"""
import asyncio
import json
import socket
import secrets
import threading
import time
import uuid

import httpx
import pytest
import uvicorn
from dotenv import dotenv_values
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions
from websockets.asyncio.client import connect

from app.core.config import ENV_PATH
from app.main import create_app

pytestmark = pytest.mark.integration

PLAYERS = ["a", "b", "c"]
# The goal is < 1 s from the moment the server confirms the action. The assertion leaves slack for a slow link;
# the real numbers are printed (run with -s) and quoted in docs/defense/realtime.md.
LATENCY_BUDGET_SECONDS = 2.0
# name -> (seconds after the HTTP request was SENT, seconds after the HTTP response ARRIVED; negative = the push beat the response)
latencies: dict[str, tuple[float, float]] = {}


def record(name, started, responded, arrived):
    latencies[name] = (arrived - started, arrived - responded)


@pytest.fixture(scope="module")
def env():
    values = dotenv_values(ENV_PATH)
    url, key = (values.get("SUPABASE_URL") or ""), (values.get("SUPABASE_SECRET_KEY") or "")
    if not url or not key or "REPLACE_ME" in key or "YOUR-" in url:
        pytest.skip("backend/.env has no real SUPABASE_URL / SUPABASE_SECRET_KEY")
    db = create_client(url, key, SyncClientOptions(auto_refresh_token=False, persist_session=False))
    if len(db.table("players").select("id").limit(30).execute().data) < 30:
        pytest.skip("needs the seeded clubs and players")
    tag = uuid.uuid4().hex[:8]
    user_ids: list[str] = []
    tournament_id = None
    server = thread = None
    try:
        tournament_id = db.table("tournaments").insert({"name": f"it-rt-{tag}"}).execute().data[0]["id"]
        creds = {}
        for name in [*PLAYERS, "admin"]:
            email, password = f"it-rt-{tag}-{name}@example.com", "It!" + secrets.token_urlsafe(14)
            created = db.auth.admin.create_user(
                {"email": email, "password": password, "email_confirm": True,
                 "user_metadata": {"display_name": f"IT {name}"}})
            user_ids.append(created.user.id)
            if name == "admin":
                db.table("profiles").update({"role": "admin"}).eq("id", created.user.id).execute()
            creds[name] = {"email": email, "password": password, "user_id": created.user.id}

        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        app = create_app()
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        deadline = time.time() + 20
        while not server.started and time.time() < deadline:
            time.sleep(0.05)
        assert server.started, "uvicorn did not start"
        while not (app.state.hub and app.state.hub.listener.subscribed) and time.time() < deadline:
            time.sleep(0.05)
        assert app.state.hub.listener.subscribed, "realtime listener did not subscribe within 20 s"
        yield {"db": db, "port": port, "creds": creds, "tournament_id": tournament_id, "app": app}
    finally:
        if server is not None:
            server.should_exit = True
            thread.join(timeout=10)
        # Events first (match_events.participant_id has no ON DELETE CASCADE); every step independent.
        try:
            if tournament_id:
                match_ids = [m["id"] for m in db.table("matches").select("id").eq("tournament_id", tournament_id).execute().data]
                if match_ids:
                    db.table("match_events").delete().in_("match_id", match_ids).execute()
                db.table("tournaments").delete().eq("id", tournament_id).execute()
        finally:
            for uid in user_ids:
                try:
                    db.auth.admin.delete_user(uid)
                except Exception:
                    pass


class Inbox:
    """A connected /ws client collecting every message with its arrival time."""

    def __init__(self, ws):
        self.ws = ws
        self.queue: asyncio.Queue = asyncio.Queue()
        self.task = asyncio.create_task(self._pump())

    async def _pump(self):
        try:
            async for raw in self.ws:
                self.queue.put_nowait((time.perf_counter(), json.loads(raw)))
        except Exception:
            pass

    async def expect(self, type_, timeout=6.0):
        deadline = time.perf_counter() + timeout
        while True:
            remaining = deadline - time.perf_counter()
            assert remaining > 0, f"no {type_} within {timeout}s"
            arrived, message = await asyncio.wait_for(self.queue.get(), remaining)
            if message["type"] == type_:
                return arrived, message
            raise AssertionError(f"expected {type_}, got {message}")

    async def silent_for(self, seconds):
        await asyncio.sleep(seconds)
        assert self.queue.empty(), f"unexpected message: {self.queue.get_nowait()[1]}"


async def login(http, creds):
    r = await http.post("/auth/login", json={"email": creds["email"], "password": creds["password"]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}, r.json()["accessToken"]


def test_realtime_chain_end_to_end(env):
    asyncio.run(_scenario(env))
    print("\nlatency in ms [since request sent / since HTTP response arrived]:")
    for name, (total, lag) in latencies.items():
        print(f"  {name:<18} {total * 1000:6.0f} / {lag * 1000:6.0f}")


async def _scenario(env):
    port, creds, db = env["port"], env["creds"], env["db"]
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=20) as http:
        headers, tokens = {}, {}
        for name in [*PLAYERS, "admin"]:
            headers[name], tokens[name] = await login(http, creds[name])

        participant = {}
        for name in PLAYERS:
            r = await http.post("/participants/me/assign-club", headers=headers[name])
            assert r.status_code == 200, r.text
            participant[name] = r.json()["participant"]["id"]
        by_pid = {pid: name for name, pid in participant.items()}

        inbox: dict[str, Inbox] = {}
        sockets = []
        try:
            for name in [*PLAYERS, "admin"]:
                ws = await connect(f"ws://127.0.0.1:{port}/ws")
                sockets.append(ws)
                await ws.send(json.dumps({"type": "AUTH", "token": tokens[name]}))
                inbox[name] = Inbox(ws)
                _, hello = await inbox[name].expect("AUTH_OK")
                assert hello["userId"] == creds[name]["user_id"]
            everyone = list(inbox)

            async def timed(coro_fn):
                started = time.perf_counter()
                response = await coro_fn()
                responded = time.perf_counter()
                assert response.status_code in (200, 201), response.text
                return started, responded

            # 1) start: 6 matches inserted in one transaction -> exactly ONE TOURNAMENT_STARTED each
            started, responded = await timed(lambda: http.post("/admin/tournament/start", headers=headers["admin"]))
            for name in everyone:
                arrived, msg = await inbox[name].expect("TOURNAMENT_STARTED")
                assert msg["tournamentId"] == env["tournament_id"]
            record("start", started, responded, arrived)
            for name in everyone:
                await inbox[name].silent_for(0.8)  # no duplicates from the other 5 inserts

            # 2) activate round 1 -> ROUND_ACTIVATED for everyone, once
            started, responded = await timed(lambda: http.post("/admin/rounds/next/activate", headers=headers["admin"]))
            for name in everyone:
                arrived, msg = await inbox[name].expect("ROUND_ACTIVATED")
                assert msg["round"] == 1
            record("activate", started, responded, arrived)
            for name in everyone:
                await inbox[name].silent_for(0.5)

            async def active_match():
                r = await http.get("/admin/matches?status=ACTIVE", headers=headers["admin"])
                [m] = r.json()
                return m["id"], by_pid[m["home"]["participantId"]], by_pid[m["away"]["participantId"]]

            async def squad(name):
                return (await http.get("/me/squad", headers=headers[name])).json()

            async def goal(match_id, who, minute):
                body = {"id": str(uuid.uuid4()), "participantId": participant[who],
                        "playerId": (await squad(who))[0]["id"], "type": "GOAL", "minute": minute}
                return await http.post(f"/matches/{match_id}/events", headers=headers[who], json=body), body["id"]

            # 3) a goal: only the two players of that match are told (the third and the admin are not)
            match_id, home, away = await active_match()
            rest = ({*PLAYERS} - {home, away}).pop()
            started = time.perf_counter()
            r, event_id = await goal(match_id, home, 10)
            responded = time.perf_counter()
            assert r.status_code == 201, r.text
            for name in (home, away):
                arrived, msg = await inbox[name].expect("MATCH_EVENT_CREATED")
                assert (msg["matchId"], msg["eventId"], msg["eventType"]) == (match_id, event_id, "GOAL")
                record(f"goal->{'home' if name == home else 'away'}", started, responded, arrived)
            await inbox[rest].silent_for(1.0)
            await inbox["admin"].silent_for(0.0)

            # re-sending the same event id: no new notification (INSERT ... ON CONFLICT DO NOTHING inserts nothing)
            body_again = {"id": event_id, "participantId": participant[home],
                          "playerId": (await squad(home))[0]["id"], "type": "GOAL", "minute": 10}
            again = await http.post(f"/matches/{match_id}/events", headers=headers[home], json=body_again)
            assert again.status_code == 200 and again.json()["alreadyRecorded"] is True
            await inbox[away].silent_for(0.8)

            # 4) finish -> the visitor learns there is a result to answer; 5) reject -> dispute
            started, responded = await timed(lambda: http.post(f"/matches/{match_id}/finish", headers=headers[home]))
            for name in (home, away):
                arrived, msg = await inbox[name].expect("MATCH_RESULT_PENDING")
                assert (msg["homeScore"], msg["awayScore"]) == (1, 0)
            record("finish->visitor", started, responded, arrived)
            await timed(lambda: http.post(f"/matches/{match_id}/reject", headers=headers[away]))
            for name in (home, away):
                await inbox[name].expect("MATCH_DISPUTED")
            await inbox[rest].silent_for(0.5)

            # 6) admin resolves -> MATCH_RESOLVED to the two, STANDINGS_UPDATED to everyone
            r = await http.post(f"/admin/matches/{match_id}/resolve", headers=headers["admin"],
                                json={"homeScore": 2, "awayScore": 2, "note": "integration"})
            assert r.status_code == 200, r.text
            for name in (home, away):
                _, msg = await inbox[name].expect("MATCH_RESOLVED")
                assert (msg["homeScore"], msg["awayScore"]) == (2, 2)
            for name in everyone:
                await inbox[name].expect("STANDINGS_UPDATED")

            # 7) round 2: the approved path. The previous pair may differ; always address the real home/away.
            await timed(lambda: http.post("/admin/rounds/next/activate", headers=headers["admin"]))
            for name in everyone:
                _, msg = await inbox[name].expect("ROUND_ACTIVATED")
                assert msg["round"] == 2
            match_id, home, away = await active_match()
            r, _ = await goal(match_id, away, 30)
            assert r.status_code == 201, r.text
            for name in (home, away):
                await inbox[name].expect("MATCH_EVENT_CREATED")
            await timed(lambda: http.post(f"/matches/{match_id}/finish", headers=headers[home]))
            for name in (home, away):
                _, msg = await inbox[name].expect("MATCH_RESULT_PENDING")
                assert (msg["homeScore"], msg["awayScore"]) == (0, 1)
            await timed(lambda: http.post(f"/matches/{match_id}/confirm", headers=headers[away]))
            for name in (home, away):
                await inbox[name].expect("MATCH_CONFIRMED")
            for name in everyone:
                await inbox[name].expect("STANDINGS_UPDATED")

            # 8) a participant who is OFFLINE misses the push but the truth is in the database / REST
            await sockets[PLAYERS.index(away)].close()
            await asyncio.sleep(0.3)
            fresh = await http.get(f"/matches/{match_id}", headers=headers[away])
            assert fresh.json()["status"] == "CONFIRMED"
            assert db.table("matches").select("status").eq("id", match_id).execute().data[0]["status"] == "CONFIRMED"

            assert max(lag for _, lag in latencies.values()) < LATENCY_BUDGET_SECONDS, latencies
        finally:
            for ib in inbox.values():
                ib.task.cancel()
            for ws in sockets:
                try:
                    await ws.close()
                except Exception:
                    pass
