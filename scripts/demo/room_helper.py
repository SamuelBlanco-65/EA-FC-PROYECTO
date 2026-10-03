"""Helper for the guided phone test of the match room (phase 9). It plays the OTHER players so that you
can be the one holding the phone. Everything goes through the public API, like the app would.

  setup      enrol --bots demo accounts (participant02..), start the tournament, activate round 1.
             Your own participant is whoever is enrolled and is not a demo account.
  status     your matches (round, home/away, state) and the current round.
  advance    play every ACTIVE match that does NOT involve you (events, finish, confirm) and, when the whole
             round is CONFIRMED/RESOLVED, activate the next one.
  play-home  a bot plays HOME against you: records --goals goals and finishes, so YOU are the visitor and the
             confirm/reject dialog appears on your phone.  play-home MATCH_ID
  resolve    admin sets the official score of a DISPUTED match (so the round can be closed).  resolve MATCH_ID
  events     lists the events the SERVER stores for a match and flags repeated ids.  events MATCH_ID

Run (PowerShell, repo root):
    $env:API_URL = "https://ea-fc-api.onrender.com"
    backend\\venv\\Scripts\\python.exe scripts\\demo\\room_helper.py setup
"""
import argparse
import sys
import uuid

import httpx

from _common import api_url, error_code, fail, participant_email, password_for, say


class Session:
    def __init__(self, base: str) -> None:
        self.http = httpx.Client(base_url=base, timeout=90)  # Render may be waking up
        self.tokens: dict[str, str] = {}
        self.user_ids: dict[str, str] = {}

    def login(self, who: str, email: str, password: str) -> None:
        r = self.http.post("/auth/login", json={"email": email, "password": password})
        if r.status_code != 200:
            fail(f"login failed for {email}: {error_code(r)}")
        self.tokens[who] = r.json()["accessToken"]
        self.user_ids[who] = r.json()["user"]["id"]

    def call(self, who: str, method: str, path: str, expect=(200, 201), **kw) -> httpx.Response:
        r = self.http.request(method, path, headers={"Authorization": f"Bearer {self.tokens[who]}"}, **kw)
        if r.status_code not in expect:
            fail(f"{method} {path} as {who} -> {r.status_code} {error_code(r)}: {r.text[:200]}")
        return r


def bot_names(count: int) -> list[str]:
    return [f"participant{n:02d}" for n in range(2, count + 2)]


def login_all(api: Session, bots: int) -> None:
    api.login("admin", f"admin@{participant_email(1).split('@')[1]}", password_for("DEMO_ADMIN_PASSWORD"))
    password = password_for("DEMO_PARTICIPANT_PASSWORD")
    for who in bot_names(bots):
        api.login(who, participant_email(int(who.removeprefix("participant"))), password)


def participants(api: Session, bots: int) -> tuple[dict[str, str], str | None]:
    """({participantId: bot name}, my participantId). Mine is the enrolled one that is not a bot."""
    rows = api.call("admin", "GET", "/admin/participants").json()
    bot_users = {api.user_ids[who]: who for who in bot_names(bots)}
    owner = {p["club"]["participantId"]: bot_users[p["userId"]] for p in rows if p["userId"] in bot_users}
    mine = [p["club"]["participantId"] for p in rows if p["userId"] not in bot_users]
    return owner, (mine[0] if len(mine) == 1 else None)


def activate_next(api: Session) -> None:
    r = api.call("admin", "POST", "/admin/rounds/next/activate", expect=(200, 409))
    if r.status_code == 409:
        say("helper", f"cannot activate the next round yet: {error_code(r)}")
    else:
        say("helper", f"round {r.json()['currentRound']} activated ({r.json()['activatedMatches']} match(es))")


def describe(m: dict, mine: str | None) -> str:
    role = "-" if mine is None else ("HOME" if m["home"]["participantId"] == mine else "AWAY")
    return (f"round {m['round']} leg {m['leg']}  {m['status']:<21} {m['home']['name']} vs {m['away']['name']}"
            f"  [{role}]  score {m['homeScore']}-{m['awayScore']}  id {m['id']}")


def show_status(api: Session, bots: int) -> None:
    _, mine = participants(api, bots)
    t = api.call("admin", "GET", "/tournament").json()
    say("helper", f"tournament '{t['name']}' {t['status']}, current round {t['currentRound']}, "
                  f"{t['participantCount']} participants")
    fixtures = api.call("admin", "GET", "/tournament/fixtures").json()
    for m in sorted(fixtures, key=lambda f: (f["round"], f["leg"])):
        if mine and mine in (m["home"]["participantId"], m["away"]["participantId"]):
            say("helper", "YOU  " + describe(m, mine))
        else:
            say("helper", "     " + describe(m, mine))


def play_events(api: Session, match: dict, owner: dict[str, str], who: str, goals: int, side_pid: str) -> None:
    squad = api.call(who, "GET", "/me/squad").json()
    for i in range(goals):
        body = {"id": str(uuid.uuid4()), "participantId": side_pid, "playerId": squad[i % len(squad)]["id"],
                "type": "GOAL", "minute": 10 + 15 * i}
        api.call(who, "POST", f"/matches/{match['id']}/events", json=body)
        say(who, f"GOAL min {body['minute']} {squad[i % len(squad)]['name']}")


def cmd_setup(api: Session, args) -> None:
    login_all(api, args.bots)
    t = api.call("admin", "GET", "/tournament").json()
    if t["status"] != "DRAFT":
        fail(f"the tournament is already {t['status']}; setup only works on a DRAFT one")
    for who in bot_names(args.bots):
        r = api.call(who, "POST", "/participants/me/assign-club", expect=(200, 201))
        say("helper", f"{who} enrolled with {r.json()['club']['name']}")
    r = api.call("admin", "POST", "/admin/tournament/start")
    say("helper", f"tournament started: {r.json()['matchCount']} matches in {r.json()['roundCount']} rounds")
    activate_next(api)
    show_status(api, args.bots)


def cmd_status(api: Session, args) -> None:
    login_all(api, args.bots)
    show_status(api, args.bots)


def cmd_advance(api: Session, args) -> None:
    login_all(api, args.bots)
    owner, mine = participants(api, args.bots)
    active = api.call("admin", "GET", "/admin/matches?status=ACTIVE").json()
    for m in active:
        h, a = m["home"]["participantId"], m["away"]["participantId"]
        if h in owner and a in owner:
            say("helper", "bots play: " + describe(m, mine))
            play_events(api, m, owner, owner[h], 2, h)
            play_events(api, m, owner, owner[a], 1, a)
            api.call(owner[h], "POST", f"/matches/{m['id']}/finish")
            r = api.call(owner[a], "POST", f"/matches/{m['id']}/confirm").json()
            say("helper", f"-> {r['status']} {r['homeScore']}-{r['awayScore']}")
    fixtures = api.call("admin", "GET", "/tournament/fixtures").json()
    t = api.call("admin", "GET", "/tournament").json()
    current = [f for f in fixtures if f["round"] == t["currentRound"]]
    if current and all(f["status"] in ("CONFIRMED", "RESOLVED") for f in current):
        activate_next(api)
    else:
        left = [describe(f, mine) for f in current if f["status"] not in ("CONFIRMED", "RESOLVED")]
        say("helper", "round still open: " + "; ".join(left))
    show_status(api, args.bots)


def cmd_play_home(api: Session, args) -> None:
    login_all(api, args.bots)
    owner, mine = participants(api, args.bots)
    m = api.call("admin", "GET", f"/matches/{args.match_id}").json()
    h = m["home"]["participantId"]
    if h not in owner:
        fail("the HOME side of this match is not one of the bots (you are home: finish it on the phone)")
    play_events(api, m, owner, owner[h], args.goals, h)
    r = api.call(owner[h], "POST", f"/matches/{m['id']}/finish").json()
    say("helper", f"home bot finished -> {r['status']} {r['homeScore']}-{r['awayScore']}: answer on your phone")


def cmd_resolve(api: Session, args) -> None:
    login_all(api, args.bots)
    r = api.call("admin", "POST", f"/admin/matches/{args.match_id}/resolve",
                 json={"homeScore": args.home, "awayScore": args.away, "note": "phase 9 test"}).json()
    say("helper", f"resolved -> {r['status']} {r['homeScore']}-{r['awayScore']}")


def cmd_events(api: Session, args) -> None:
    login_all(api, args.bots)
    m = api.call("admin", "GET", f"/matches/{args.match_id}").json()
    ids = [e["id"] for e in m["events"]]
    say("helper", f"match {m['id'][:8]} {m['status']} score {m['homeScore']}-{m['awayScore']}: "
                  f"{len(ids)} stored event(s), {len(set(ids))} distinct id(s)")
    for e in sorted(m["events"], key=lambda e: (e["minute"], e["createdAt"])):
        say("helper", f"  {e['minute']:>3}'  {e['type']:<6} {e['playerName']}  id {e['id']}")
    if len(ids) != len(set(ids)):
        fail("REPEATED event ids on the server")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--api-url", help="backend base URL (default: $API_URL or http://127.0.0.1:8000)")
    parser.add_argument("--bots", type=int, default=2, help="demo accounts participant02.. acting as rivals (default 2)")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("setup").set_defaults(run=cmd_setup)
    sub.add_parser("status").set_defaults(run=cmd_status)
    sub.add_parser("advance").set_defaults(run=cmd_advance)
    p = sub.add_parser("play-home")
    p.add_argument("match_id")
    p.add_argument("--goals", type=int, default=2)
    p.set_defaults(run=cmd_play_home)
    p = sub.add_parser("resolve")
    p.add_argument("match_id")
    p.add_argument("--home", type=int, default=1)
    p.add_argument("--away", type=int, default=1)
    p.set_defaults(run=cmd_resolve)
    p = sub.add_parser("events")
    p.add_argument("match_id")
    p.set_defaults(run=cmd_events)
    args = parser.parse_args()
    args.run(Session(api_url(args.api_url)), args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
