"""Visitor bot: lets you test the confirm/reject handshake with ONE phone.

It logs in as a participant, opens /ws, and when the server announces MATCH_RESULT_PENDING it answers on
behalf of the visitor: --approve confirms the result, --reject disputes it. If it happens to be the HOME
player of that match the server answers 403 and the bot ignores the message (the rules live in the backend,
not here). After a disconnection it logs in again and asks REST for results already waiting: the WebSocket
only notifies, the database is the truth.

Run (PowerShell, repo root, backend running):
    backend\\venv\\Scripts\\python.exe scripts\\demo\\visitor_bot.py --approve
    backend\\venv\\Scripts\\python.exe scripts\\demo\\visitor_bot.py --email participant03@example.com --reject --count 2
"""
import argparse
import asyncio
import json
import sys
import time

import httpx
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from _common import api_url, error_code, fail, participant_email, password_for, say, ws_url

NOT_MY_MATCH = {"NOT_MATCH_AWAY", "NOT_IN_MATCH"}  # answers the server gives to someone who is not the visitor
AUTH_TIMEOUT = 10


class Bot:
    def __init__(self, base: str, email: str, password: str, decision: str, count: int) -> None:
        self.base, self.email, self.password = base, email, password
        self.decision = decision  # "confirm" | "reject"
        self.remaining = count  # 0 = run until Ctrl-C
        self.http = httpx.AsyncClient(base_url=base, timeout=15)
        self.token = ""

    async def login(self) -> None:
        r = await self.http.post("/auth/login", json={"email": self.email, "password": self.password})
        if r.status_code != 200:
            fail(f"login failed for {self.email}: {error_code(r)}")
        self.token = r.json()["accessToken"]

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    async def respond(self, match_id: str, arrived: float | None = None) -> bool:
        started = time.perf_counter()
        r = await self.http.post(f"/matches/{match_id}/{self.decision}", headers=self.headers)
        took = (time.perf_counter() - started) * 1000
        if r.status_code == 200:
            body = r.json()
            since = f", {(time.perf_counter() - arrived) * 1000:.0f} ms after the notification" if arrived else ""
            say("bot", f"{self.decision} sent -> match is now {body['status']} "
                       f"(score {body['homeScore']}-{body['awayScore']}; request took {took:.0f} ms{since})")
            return True
        code = error_code(r)
        if r.status_code == 403 and code in NOT_MY_MATCH:
            say("bot", f"match {match_id[:8]}: I am not the visitor ({code}); ignoring")
        elif r.status_code == 409:
            say("bot", f"match {match_id[:8]}: nobody to answer any more ({code})")
        else:
            say("bot", f"match {match_id[:8]}: could not {self.decision}: {r.status_code} {code}")
        return False

    def _count_answer(self) -> bool:
        """True when the requested number of matches has been answered (count 0 = never stop)."""
        if self.remaining == 0:
            return False
        self.remaining -= 1
        return self.remaining == 0

    async def reconcile(self) -> bool:
        """Answer results that were already waiting (missed while disconnected): REST is the source of truth.
        Returns True when the bot has answered all it was asked to."""
        r = await self.http.get("/tournament/fixtures", headers=self.headers)
        if r.status_code != 200:
            return False
        waiting = [m["id"] for m in r.json() if m["status"] == "PENDING_CONFIRMATION"]
        if waiting:
            say("bot", f"{len(waiting)} result(s) already waiting in the database")
        for match_id in waiting:
            if await self.respond(match_id) and self._count_answer():
                return True
        return False

    async def session(self) -> None:
        await self.login()
        async with connect(ws_url(self.base)) as ws:
            await ws.send(json.dumps({"type": "AUTH", "token": self.token}))
            hello = json.loads(await asyncio.wait_for(ws.recv(), AUTH_TIMEOUT))
            if hello.get("type") != "AUTH_OK":
                raise ConnectionError(f"unexpected first message: {hello}")
            say("bot", f"connected as {self.email}; waiting for MATCH_RESULT_PENDING "
                       f"(will {self.decision}) ...")
            if await self.reconcile():
                return
            async for raw in ws:
                arrived = time.perf_counter()
                message = json.loads(raw)
                kind = message["type"]
                if kind == "MATCH_RESULT_PENDING":
                    say("bot", f"<- {kind} match={message['matchId'][:8]} "
                               f"score={message['homeScore']}-{message['awayScore']}")
                    if await self.respond(message["matchId"], arrived) and self._count_answer():
                        say("bot", "requested number of matches answered; bye")
                        return
                elif kind == "RESYNC_REQUIRED":
                    say("bot", "<- RESYNC_REQUIRED: the backend may have missed changes; checking REST")
                    if await self.reconcile():
                        return
                else:
                    say("bot", f"<- {kind}")

    async def run(self) -> None:
        backoff = 1.0
        while True:
            try:
                await self.session()
                return
            except (ConnectionClosed, ConnectionError, OSError, asyncio.TimeoutError, httpx.HTTPError) as exc:
                say("bot", f"connection lost ({type(exc).__name__}); retrying in {backoff:.0f}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 15)

    async def close(self) -> None:
        await self.http.aclose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--approve", action="store_true", help="confirm the result when the bot is the visitor")
    choice.add_argument("--reject", action="store_true", help="dispute the result when the bot is the visitor")
    parser.add_argument("--email", default=participant_email(2), help="account to act as (default: participant02)")
    parser.add_argument("--api-url", help="backend base URL (default: $API_URL or http://127.0.0.1:8000)")
    parser.add_argument("--count", type=int, default=1, help="answer this many matches then exit (0 = forever)")
    args = parser.parse_args()

    bot = Bot(api_url(args.api_url), args.email, password_for("DEMO_PARTICIPANT_PASSWORD"),
              "confirm" if args.approve else "reject", args.count)

    async def runner() -> None:
        try:
            await bot.run()
        finally:
            await bot.close()

    try:
        asyncio.run(runner())
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
