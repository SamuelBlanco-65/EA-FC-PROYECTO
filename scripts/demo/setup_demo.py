"""Reset the demo tournament with N simulated participants, ready to present.

What it does (and ONLY this):
  1. Deletes every tournament named exactly --name (default "Torneo de demo"): its match_events first
     (match_events.participant_id has no ON DELETE CASCADE), then the tournament (the rest cascades).
     Other tournaments, e.g. "Torneo de prueba", are never touched.
  2. Inserts a fresh DRAFT tournament with that name. It becomes the CURRENT one (the most recently created),
     so the apps show it instead of the older ones. `--teardown` deletes it and gives the old one back.
  3. Enrols N bot accounts (participant02..participantN+1) through the public API: the SERVER draws their clubs.
  4. Optional --start: starts the tournament and activates round 1 (the enrolment closes: nobody can join later).
     Optional --play-rounds K: bots play K full rounds (random scores) and the next round is activated.
     Optional --dispute: in the active round one match is left DISPUTED and another PENDING_CONFIRMATION,
     so the admin screens have something to resolve.

Without --yes nothing is written: it only prints the plan and what exists now.

Requirements: backend/.env (secret key, for the reset only), accounts from create_users.py (N+1 participants and
the admin), passwords in the environment or scripts/demo/demo.env, and the API running (local or Render).

Run (PowerShell, repo root):
    backend\\venv\\Scripts\\python.exe scripts\\demo\\setup_demo.py 4                      # plan only
    backend\\venv\\Scripts\\python.exe scripts\\demo\\setup_demo.py 4 --yes                # DRAFT with 4 bots
    backend\\venv\\Scripts\\python.exe scripts\\demo\\setup_demo.py 4 --yes --start --play-rounds 2 --dispute
    backend\\venv\\Scripts\\python.exe scripts\\demo\\setup_demo.py --teardown --yes
"""
import argparse
import random
import sys

from create_users import admin_client
from room_helper import Session, activate_next, bot_names, login_all, play_events

from _common import api_url, fail, say

DEFAULT_NAME = "Torneo de demo"
MIN_BOTS = 2
MAX_BOTS = 24  # 25 seats in total: leaves one for whoever presents
CHUNK = 100  # ids per `in` filter: 600 UUIDs would overflow the PostgREST URL


def tournaments_named(db, name: str) -> list[dict]:
    return db.table("tournaments").select("id,name,status,current_round,created_at").eq("name", name).execute().data


def newest_tournament(db) -> dict | None:
    rows = db.table("tournaments").select("id,name,status,current_round").order("created_at", desc=True).limit(1).execute().data
    return rows[0] if rows else None


def delete_tournament(db, tournament_id: str) -> None:
    match_ids = [m["id"] for m in db.table("matches").select("id").eq("tournament_id", tournament_id).execute().data]
    for start in range(0, len(match_ids), CHUNK):
        db.table("match_events").delete().in_("match_id", match_ids[start:start + CHUNK]).execute()
    db.table("tournaments").delete().eq("id", tournament_id).execute()


def describe(db, row: dict) -> str:
    matches = db.table("matches").select("id", count="exact").eq("tournament_id", row["id"]).execute().count
    seats = db.table("tournament_participants").select("id", count="exact").eq("tournament_id", row["id"]).execute().count
    return f"'{row['name']}' {row['status']} round {row['current_round']}, {seats} participants, {matches} matches"


def reset_database(db, name: str) -> None:
    for row in tournaments_named(db, name):
        say("setup", f"deleting {describe(db, row)}")
        delete_tournament(db, row["id"])


def create_draft(db, name: str) -> None:
    db.table("tournaments").insert({"name": name}).execute()
    say("setup", f"created DRAFT tournament '{name}' (now the current one)")


def enrol_bots(api: Session, bots: int) -> None:
    for who in bot_names(bots):
        r = api.call(who, "POST", "/participants/me/assign-club", expect=(200, 201))
        say("setup", f"{who} enrolled with {r.json()['club']['name']}")


def owners(api: Session, bots: int) -> dict[str, str]:
    """{participantId: bot name}. Every enrolled participant must be a bot: the script plays for all of them."""
    rows = api.call("admin", "GET", "/admin/participants").json()
    by_user = {api.user_ids[who]: who for who in bot_names(bots)}
    unknown = [p["displayName"] for p in rows if p["userId"] not in by_user]
    if unknown:
        fail(f"enrolled participants that are not demo bots: {unknown}")
    return {p["club"]["participantId"]: by_user[p["userId"]] for p in rows}


def active_matches(api: Session) -> list[dict]:
    return sorted(api.call("admin", "GET", "/admin/matches?status=ACTIVE").json(), key=lambda m: (m["leg"], m["id"]))


def play(api: Session, m: dict, owner: dict[str, str], rng: random.Random) -> None:
    home, away = m["home"]["participantId"], m["away"]["participantId"]
    play_events(api, m, owner, owner[home], rng.randint(0, 3), home)
    play_events(api, m, owner, owner[away], rng.randint(0, 3), away)
    api.call(owner[home], "POST", f"/matches/{m['id']}/finish")


def play_round(api: Session, owner: dict[str, str], rng: random.Random) -> None:
    for m in active_matches(api):
        play(api, m, owner, rng)
        r = api.call(owner[m["away"]["participantId"]], "POST", f"/matches/{m['id']}/confirm").json()
        say("setup", f"round {m['round']}: {m['home']['name']} {r['homeScore']}-{r['awayScore']} {m['away']['name']} ({r['status']})")


def leave_work_for_admin(api: Session, owner: dict[str, str], rng: random.Random) -> None:
    matches = active_matches(api)
    if not matches:
        say("setup", "no active round: nothing to leave in dispute (all rounds were played)")
        return
    first = matches[0]
    play(api, first, owner, rng)
    api.call(owner[first["away"]["participantId"]], "POST", f"/matches/{first['id']}/reject")
    say("setup", f"DISPUTED: {first['home']['name']} vs {first['away']['name']}")
    if len(matches) > 1:
        second = matches[1]
        play(api, second, owner, rng)
        say("setup", f"PENDING_CONFIRMATION: {second['home']['name']} vs {second['away']['name']}")


def run_tournament(api: Session, bots: int, args: argparse.Namespace) -> None:
    started = api.call("admin", "POST", "/admin/tournament/start").json()
    say("setup", f"started: {started['matchCount']} matches in {started['roundCount']} rounds")
    activate_next(api)
    owner = owners(api, bots)
    rng = random.Random(args.seed)
    for played in range(min(args.play_rounds, started["roundCount"])):
        play_round(api, owner, rng)
        if played + 1 < started["roundCount"]:
            activate_next(api)
    if args.dispute:
        leave_work_for_admin(api, owner, rng)


def summary(bots: int, args: argparse.Namespace) -> None:
    say("setup", "READY. Sign in with these accounts (passwords: your env / scripts/demo/demo.env):")
    say("setup", "  admin@example.com                      -> Perfil > Administracion")
    say("setup", f"  participant02..participant{bots + 1:02d}@example.com   -> simulated players (bots)")
    if not args.start:
        say("setup", "  Tournament is DRAFT: the presenter can join with the roulette (e.g. participant01), then start it from the admin screen.")
    else:
        say("setup", "  Tournament already started: new players cannot enrol. Continue with room_helper.py status/advance.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("bots", type=int, nargs="?", default=4, help=f"simulated participants {MIN_BOTS}..{MAX_BOTS} (default 4)")
    parser.add_argument("--name", default=DEFAULT_NAME, help=f"tournament name (default '{DEFAULT_NAME}')")
    parser.add_argument("--api-url", help="backend base URL (default: $API_URL or http://127.0.0.1:8000)")
    parser.add_argument("--yes", action="store_true", help="really write (without it: plan only)")
    parser.add_argument("--teardown", action="store_true", help="only delete the demo tournament (the previous one becomes current)")
    parser.add_argument("--start", action="store_true", help="start the tournament and activate round 1")
    parser.add_argument("--play-rounds", type=int, default=0, metavar="K", help="bots play K rounds (implies --start)")
    parser.add_argument("--dispute", action="store_true", help="leave a DISPUTED and a PENDING match in the active round (implies --start)")
    parser.add_argument("--seed", type=int, default=None, help="seed for the random scores (repeatable demo)")
    args = parser.parse_args()
    if args.play_rounds < 0:
        fail("--play-rounds cannot be negative")
    args.start = args.start or args.play_rounds > 0 or args.dispute
    if not args.teardown and not MIN_BOTS <= args.bots <= MAX_BOTS:
        fail(f"bots must be between {MIN_BOTS} and {MAX_BOTS}")

    db = admin_client()
    existing = tournaments_named(db, args.name)
    current = newest_tournament(db)
    say("setup", f"current tournament now: {describe(db, current) if current else 'none'}")
    for row in existing:
        say("setup", f"will delete: {describe(db, row)}")
    if not args.yes:
        action = "delete the demo tournament" if args.teardown else (
            f"recreate '{args.name}' as DRAFT with {args.bots} bots" + (", start it" if args.start else "")
            + (f", play {args.play_rounds} round(s)" if args.play_rounds else "") + (", leave a dispute" if args.dispute else ""))
        say("setup", f"PLAN ONLY (nothing written): would {action}. Add --yes to apply.")
        return 0

    if args.teardown:
        reset_database(db, args.name)
        now = newest_tournament(db)
        say("setup", f"done. Current tournament: {describe(db, now) if now else 'none'}")
        return 0

    api = Session(api_url(args.api_url))
    login_all(api, args.bots)  # fails early (before deleting anything) if an account or the API is missing
    reset_database(db, args.name)
    create_draft(db, args.name)
    enrol_bots(api, args.bots)
    if args.start:
        run_tournament(api, args.bots, args)
    summary(args.bots, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
