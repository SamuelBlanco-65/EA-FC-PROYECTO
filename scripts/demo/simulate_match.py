"""Plays one complete match over HTTP against a running backend, as the real app would.

Steps: (enrol + start the tournament if it is still a DRAFT) -> activate the next round if no match is
ACTIVE -> goals/cards of BOTH teams -> home finishes -> visitor confirms (approved) or rejects (dispute) ->
on a dispute the admin sets the official score. Needs the demo accounts (create_users.py) enrolled in the
tournament; the only thing it cannot do is create the tournament row itself (no endpoint yet, see PROGRESS.md).

Scenarios:
  approved   visitor confirms                       -> CONFIRMED
  dispute    visitor rejects, admin resolves        -> DISPUTED -> RESOLVED
  both       approved on one round, next round activated, dispute on that one
Visitor:
  --visitor self   this script answers as the visitor (default)
  --visitor bot    stop after "finish" and wait for visitor_bot.py (run it in another terminal) to answer

Run (PowerShell, repo root, backend running):
    backend\\venv\\Scripts\\python.exe scripts\\demo\\simulate_match.py --scenario approved
    backend\\venv\\Scripts\\python.exe scripts\\demo\\simulate_match.py --scenario dispute --visitor bot
"""
import argparse
import sys
import time
import uuid

import httpx

from _common import api_url, error_code, fail, participant_email, password_for, say

POLL_SECONDS = 90


class Api:
    def __init__(self, base: str) -> None:
        self.http = httpx.Client(base_url=base, timeout=20)
        self.headers: dict[str, dict[str, str]] = {}
        self.user_id: dict[str, str] = {}

    def login(self, who: str, email: str, password: str) -> None:
        r = self.http.post("/auth/login", json={"email": email, "password": password})
        if r.status_code != 200:
            fail(f"login failed for {email}: {error_code(r)}")
        self.headers[who] = {"Authorization": f"Bearer {r.json()['accessToken']}"}
        self.user_id[who] = r.json()["user"]["id"]

    def call(self, who: str, method: str, path: str, expect=(200, 201), **kw):
        r = self.http.request(method, path, headers=self.headers[who], **kw)
        if r.status_code not in expect:
            fail(f"{method} {path} as {who} -> {r.status_code} {error_code(r)}: {r.text[:200]}")
        return r


def standings_snapshot(api: Api) -> None:
    rows = api.call("admin", "GET", "/tournament/standings").json()
    say("sim", "standings:")
    for row in rows[:5]:
        say("sim", f"   {row['position']}. {row['clubName']:<24} PJ {row['played']}  PTS {row['points']}  "
                   f"GF {row['goalsFor']} GA {row['goalsAgainst']}")


def ensure_started(api: Api, accounts: list[str]) -> None:
    tournament = api.call("admin", "GET", "/tournament", expect=(200, 404))
    if tournament.status_code == 404:
        fail("no tournament exists. Insert one first (SQL: insert into tournaments (name) values ('Demo');)")
    if tournament.json()["status"] != "DRAFT":
        return
    for who in accounts:
        r = api.call(who, "POST", "/participants/me/assign-club")
        say("sim", f"{who} enrolled with {r.json()['club']['name']}")
    r = api.call("admin", "POST", "/admin/tournament/start")
    say("sim", f"tournament started: {r.json()['matchCount']} matches in {r.json()['roundCount']} rounds")


def pick_active_match(api: Api, owner_of: dict[str, str]):
    """An ACTIVE match whose home AND away are demo accounts we can log in as. Activates a round if needed."""
    for attempt in range(2):
        active = api.call("admin", "GET", "/admin/matches?status=ACTIVE").json()
        mine = [m for m in active if m["home"]["participantId"] in owner_of and m["away"]["participantId"] in owner_of]
        if mine:
            return mine[0]
        if active:
            fail("there are ACTIVE matches but none between the demo accounts you passed; "
                 "raise --participants so it covers the enrolled players")
        if attempt == 0:
            r = api.call("admin", "POST", "/admin/rounds/next/activate", expect=(200, 409))
            if r.status_code == 409:
                fail(f"cannot activate the next round: {error_code(r)} (close or resolve the open matches first)")
            say("sim", f"round {r.json()['currentRound']} activated ({r.json()['activatedMatches']} matches)")
    fail("no playable match found")


def play(api: Api, match: dict, owner_of: dict[str, str], scenario: str, visitor: str, bot_email: str) -> None:
    home, away = owner_of[match["home"]["participantId"]], owner_of[match["away"]["participantId"]]
    pid = {home: match["home"]["participantId"], away: match["away"]["participantId"]}
    mid = match["id"]
    say("sim", f"match {mid[:8]}: {match['home']['name']} ({home}) vs {match['away']['name']} ({away}), "
               f"round {match['round']} leg {match['leg']}")

    squads = {who: api.call(who, "GET", "/me/squad").json() for who in (home, away)}

    def event(who: str, kind: str, minute: int, player: int) -> None:
        body = {"id": str(uuid.uuid4()), "participantId": pid[who], "playerId": squads[who][player]["id"],
                "type": kind, "minute": minute}
        r = api.call(who, "POST", f"/matches/{mid}/events", json=body)
        say(who, f"{kind} min {minute} {squads[who][player]['name']} (recorded, alreadyRecorded={r.json()['alreadyRecorded']})")

    event(home, "GOAL", 12, 0)
    event(away, "GOAL", 33, 1)
    event(home, "YELLOW", 41, 2)
    event(home, "GOAL", 67, 3)
    event(away, "RED", 80, 2)

    finished = api.call(home, "POST", f"/matches/{mid}/finish").json()
    say(home, f"FINISH -> {finished['status']}, server-derived score {finished['homeScore']}-{finished['awayScore']}")

    if visitor == "bot":
        say("sim", f"waiting up to {POLL_SECONDS}s for the visitor bot. In another terminal run:")
        flag = "--approve" if scenario == "approved" else "--reject"
        email = bot_email or participant_email(int(away.removeprefix("participant")) if away.startswith("participant") else 2)
        say("sim", f"   backend\\venv\\Scripts\\python.exe scripts\\demo\\visitor_bot.py --email {email} {flag}")
        deadline = time.time() + POLL_SECONDS
        status = "PENDING_CONFIRMATION"
        while status == "PENDING_CONFIRMATION" and time.time() < deadline:
            time.sleep(0.5)
            status = api.call(home, "GET", f"/matches/{mid}").json()["status"]
        if status == "PENDING_CONFIRMATION":
            fail("the visitor did not answer in time")
        say("sim", f"visitor answered: match is {status}")
    elif scenario == "approved":
        r = api.call(away, "POST", f"/matches/{mid}/confirm").json()
        say(away, f"CONFIRM -> {r['status']}")
    else:
        r = api.call(away, "POST", f"/matches/{mid}/reject").json()
        say(away, f"REJECT -> {r['status']}")

    final = api.call(home, "GET", f"/matches/{mid}").json()
    if final["status"] == "DISPUTED":
        resolved = api.call("admin", "POST", f"/admin/matches/{mid}/resolve",
                            json={"homeScore": 1, "awayScore": 1, "note": "demo: official score set by the admin"}).json()
        say("admin", f"RESOLVE -> {resolved['status']}, official score {resolved['homeScore']}-{resolved['awayScore']}")
        final = resolved
    say("sim", f"final state: {final['status']} {final['homeScore']}-{final['awayScore']}")
    standings_snapshot(api)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--scenario", choices=["approved", "dispute", "both"], default="approved")
    parser.add_argument("--visitor", choices=["self", "bot"], default="self")
    parser.add_argument("--participants", type=int, default=2, help="demo accounts participant01..NN to use (default 2)")
    parser.add_argument("--bot-email", default="", help="only to print the bot command; default: the visitor of the match")
    parser.add_argument("--api-url", help="backend base URL (default: $API_URL or http://127.0.0.1:8000)")
    args = parser.parse_args()
    if not 2 <= args.participants <= 25:
        fail("--participants must be between 2 and 25")

    api = Api(api_url(args.api_url))
    api.login("admin", f"admin@{participant_email(1).split('@')[1]}", password_for("DEMO_ADMIN_PASSWORD"))
    password = password_for("DEMO_PARTICIPANT_PASSWORD")
    accounts = [f"participant{n:02d}" for n in range(1, args.participants + 1)]
    for who in accounts:
        api.login(who, participant_email(int(who.removeprefix("participant"))), password)

    ensure_started(api, accounts)
    # participant id of each demo account, from the admin listing (userId matches the login's user id)
    by_user = {p["userId"]: p["club"]["participantId"] for p in api.call("admin", "GET", "/admin/participants").json()}
    owner_of = {by_user[api.user_id[who]]: who for who in accounts if api.user_id[who] in by_user}
    if len(owner_of) < 2:
        fail("fewer than 2 demo accounts are enrolled in the current tournament")

    scenarios = ["approved", "dispute"] if args.scenario == "both" else [args.scenario]
    for index, scenario in enumerate(scenarios):
        say("sim", f"=== scenario: {scenario} ===")
        if index > 0:
            r = api.call("admin", "POST", "/admin/rounds/next/activate", expect=(200, 409))
            if r.status_code == 409:
                fail(f"cannot activate the next round: {error_code(r)}")
            say("sim", f"round {r.json()['currentRound']} activated")
        play(api, pick_active_match(api, owner_of), owner_of, scenario, args.visitor, args.bot_email)
    return 0


if __name__ == "__main__":
    sys.exit(main())
