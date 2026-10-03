"""Phase 5 through the real HTTP stack and the real database (PostgREST, RLS, the two SQL functions).

The hermetic API tests use fake repositories, so they cannot prove what only Postgres decides: the RLS
insert policy with `ON CONFLICT DO NOTHING`, the conditional UPDATE returning rows, the embeds and the
atomic `start_tournament` / `activate_round` functions. This module does, with 3 temporary players + 1 admin.
Tests run in file order and share `state`. Everything created (tournament, users) is deleted at the end.
Skip with: python -m pytest -m "not integration"
"""
import secrets
import uuid

import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

from app.core.config import ENV_PATH
from app.main import create_app

pytestmark = pytest.mark.integration

PLAYERS = ["a", "b", "c"]


@pytest.fixture(scope="module")
def env():
    values = dotenv_values(ENV_PATH)
    url, key = (values.get("SUPABASE_URL") or ""), (values.get("SUPABASE_SECRET_KEY") or "")
    if not url or not key or "REPLACE_ME" in key or "YOUR-" in url:
        pytest.skip("backend/.env has no real SUPABASE_URL / SUPABASE_SECRET_KEY")
    db = create_client(url, key, SyncClientOptions(auto_refresh_token=False, persist_session=False))
    if len(db.table("players").select("id").limit(30).execute().data) < 30:
        pytest.skip("needs the seeded clubs and players")
    app = create_app()
    client = TestClient(app)
    tag = uuid.uuid4().hex[:8]
    user_ids: list[str] = []
    tournament_id = None
    try:
        tournament_id = db.table("tournaments").insert({"name": f"it-match-{tag}"}).execute().data[0]["id"]
        headers = {}
        for name in [*PLAYERS, "admin"]:
            email, password = f"it-match-{tag}-{name}@example.com", "It!" + secrets.token_urlsafe(14)
            created = db.auth.admin.create_user(
                {"email": email, "password": password, "email_confirm": True,
                 "user_metadata": {"display_name": f"IT {name}"}})
            user_ids.append(created.user.id)
            if name == "admin":
                db.table("profiles").update({"role": "admin"}).eq("id", created.user.id).execute()
            login = client.post("/auth/login", json={"email": email, "password": password})
            assert login.status_code == 200, login.text
            headers[name] = {"Authorization": f"Bearer {login.json()['accessToken']}"}
        yield {"db": db, "client": client, "tournament_id": tournament_id, "h": headers, "user_ids": user_ids}
    finally:
        # Events first: match_events.participant_id has no ON DELETE CASCADE, so deleting the tournament alone
        # fails once events exist. Each step is independent so one failure cannot leave users behind.
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


state: dict = {}


def test_enrol_and_start(env):
    c, h = env["client"], env["h"]
    state["participant"] = {}
    for name in PLAYERS:
        r = c.post("/participants/me/assign-club", headers=h[name])
        assert r.status_code == 200, r.text
        state["participant"][name] = r.json()["participant"]["id"]
    assert c.post("/admin/tournament/start", headers=h["a"]).status_code == 403  # a participant cannot start it

    rows = c.get("/admin/participants", headers=h["admin"]).json()
    assert sorted(r["displayName"] for r in rows) == ["IT a", "IT b", "IT c"]

    started = c.post("/admin/tournament/start", headers=h["admin"])
    assert started.status_code == 200, started.text
    assert (started.json()["matchCount"], started.json()["roundCount"]) == (6, 6)
    assert started.json()["tournament"]["status"] == "ACTIVE"
    again = c.post("/admin/tournament/start", headers=h["admin"])
    assert (again.status_code, again.json()["error"]["code"]) == (409, "TOURNAMENT_ALREADY_STARTED")
    matches = env["db"].table("matches").select("id,status").eq("tournament_id", env["tournament_id"]).execute().data
    assert len(matches) == 6 and {m["status"] for m in matches} == {"SCHEDULED"}


def test_sql_functions_guard_themselves(env):
    """Called directly (bypassing the service) to prove the database enforces the rules on its own."""
    db, tid = env["db"], env["tournament_id"]

    def rpc_error(name, params):
        with pytest.raises(Exception) as exc:
            db.rpc(name, params).execute()
        return getattr(exc.value, "message", str(exc.value))

    assert rpc_error("start_tournament", {"p_tournament": tid, "p_fixtures": []}) == "TOURNAMENT_NOT_DRAFT"
    assert rpc_error("activate_round", {"p_tournament": tid, "p_expected_round": 5}) == "ROUND_CHANGED"


def test_activate_round_one(env):
    c, h = env["client"], env["h"]
    r = c.post("/admin/rounds/next/activate", headers=h["admin"])
    assert r.status_code == 200, r.text
    assert r.json() == {"currentRound": 1, "activatedMatches": 1}
    [match] = c.get("/admin/matches?status=ACTIVE", headers=h["admin"]).json()
    state["m1"] = match["id"]
    by_pid = {pid: name for name, pid in state["participant"].items()}
    state["home"], state["away"] = by_pid[match["home"]["participantId"]], by_pid[match["away"]["participantId"]]
    state["rest"] = ({*PLAYERS} - {state["home"], state["away"]}).pop()


def test_round_two_is_blocked_by_the_service_and_by_the_database(env):
    c, h, db = env["client"], env["h"], env["db"]
    r = c.post("/admin/rounds/next/activate", headers=h["admin"])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "ROUND_NOT_CLOSED")
    # Same rule, enforced by the SQL function when the service is bypassed:
    with pytest.raises(Exception) as exc:
        db.rpc("activate_round", {"p_tournament": env["tournament_id"], "p_expected_round": 1}).execute()
    assert getattr(exc.value, "message", "") == "ROUND_NOT_CLOSED"
    t = db.table("tournaments").select("current_round").eq("id", env["tournament_id"]).execute().data[0]
    assert t["current_round"] == 1  # the failed call rolled back its own UPDATE
    statuses = {m["round"]: m["status"] for m in db.table("matches").select("round,status")
                .eq("tournament_id", env["tournament_id"]).execute().data}
    assert statuses[2] == "SCHEDULED"


def squad(env, name):
    return env["client"].get("/me/squad", headers=env["h"][name]).json()


def event(env, who, *, player=None, participant=None, minute=10, type_="GOAL", event_id=None):
    body = {
        "id": str(event_id or uuid.uuid4()),
        "participantId": participant or state["participant"][who],
        "playerId": player or squad(env, who)[0]["id"],
        "type": type_,
        "minute": minute,
    }
    return body, env["client"].post(f"/matches/{state['m1']}/events", headers=env["h"][who], json=body)


def stored_events(env):
    return env["db"].table("match_events").select("id,type").eq("match_id", state["m1"]).execute().data


def test_events_idempotent_and_protected_by_rls_and_service(env):
    home, away, rest = state["home"], state["away"], state["rest"]
    body, first = event(env, home, minute=12)
    assert first.status_code == 201, first.text
    again = env["client"].post(f"/matches/{state['m1']}/events", headers=env["h"][home], json=body)
    assert again.status_code == 200 and again.json()["alreadyRecorded"] is True
    assert len(stored_events(env)) == 1  # real ON CONFLICT (id) DO NOTHING

    _, _ = event(env, home, minute=80, type_="YELLOW")
    assert len(stored_events(env)) == 2

    # Tampered requests from the visitor
    _, r = event(env, away, participant=state["participant"][home], player=squad(env, home)[0]["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (403, "NOT_YOUR_TEAM")
    _, r = event(env, away, player=squad(env, home)[0]["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (422, "PLAYER_NOT_IN_CLUB")
    _, r = event(env, rest)
    assert (r.status_code, r.json()["error"]["code"]) == (403, "NOT_IN_MATCH")
    _, r = event(env, home, minute=121)
    assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_MINUTE")
    assert len(stored_events(env)) == 2

    _, away_goal = event(env, away, minute=44)
    assert away_goal.status_code == 201, away_goal.text
    _, away_goal2 = event(env, away, minute=45)
    assert away_goal2.status_code == 201
    home_goals = 0
    for minute in (50, 60):
        _, g = event(env, home, minute=minute)
        assert g.status_code == 201
        home_goals += 1
    state["expected_score"] = (home_goals + 1, 2)  # 12' + 50' + 60' for home, 44' + 45' for away


def test_rls_alone_blocks_a_direct_insert_for_someone_elses_team(env):
    """The policy is the second wall: even if the service had a bug, Postgres refuses (user JWT, no service)."""
    from app.core.config import get_settings
    from app.core.supabase_clients import user_postgrest

    token = env["h"][state["away"]]["Authorization"].removeprefix("Bearer ")
    home_player = squad(env, state["home"])[0]["id"]
    row = {
        "id": str(uuid.uuid4()), "match_id": state["m1"], "participant_id": state["participant"][state["home"]],
        "player_id": home_player, "type": "GOAL", "minute": 7, "created_by": env["user_ids"][PLAYERS.index(state["away"])],
    }
    with pytest.raises(Exception) as exc:
        user_postgrest(get_settings(), token).from_("match_events").insert(row).execute()
    assert getattr(exc.value, "code", None) == "42501"
    assert row["id"] not in {e["id"] for e in stored_events(env)}


def test_finish_derives_the_score_and_only_home_may_finish(env):
    c, h = env["client"], env["h"]
    r = c.post(f"/matches/{state['m1']}/finish", headers=h[state["away"]])
    assert (r.status_code, r.json()["error"]["code"]) == (403, "NOT_MATCH_HOME")
    r = c.post(f"/matches/{state['m1']}/confirm", headers=h[state["home"]])
    assert (r.status_code, r.json()["error"]["code"]) == (403, "NOT_MATCH_AWAY")

    done = c.post(f"/matches/{state['m1']}/finish", headers=h[state["home"]], json={"homeScore": 9, "awayScore": 9})
    assert done.status_code == 200, done.text
    data = done.json()
    assert data["status"] == "PENDING_CONFIRMATION"
    assert (data["homeScore"], data["awayScore"]) == state["expected_score"]
    assert len(data["events"]) == 6

    again = c.post(f"/matches/{state['m1']}/finish", headers=h[state["home"]])
    assert (again.status_code, again.json()["error"]["code"]) == (409, "INVALID_TRANSITION")
    _, late = event(env, state["home"], minute=90)
    assert (late.status_code, late.json()["error"]["code"]) == (409, "MATCH_NOT_ACTIVE")  # now PENDING_CONFIRMATION


def test_confirm_updates_the_standings(env):
    c, h = env["client"], env["h"]
    r = c.post(f"/matches/{state['m1']}/confirm", headers=h[state["away"]])
    assert r.status_code == 200 and r.json()["status"] == "CONFIRMED" and r.json()["confirmedAt"]
    table = {row["participantId"]: row for row in c.get("/tournament/standings", headers=h["a"]).json()}
    winner = state["home"] if state["expected_score"][0] > state["expected_score"][1] else state["away"]
    assert table[state["participant"][winner]]["points"] == 3
    assert table[state["participant"][state["rest"]]]["played"] == 0


def test_round_two_dispute_and_admin_resolution(env):
    c, h, db = env["client"], env["h"], env["db"]
    r = c.post("/admin/rounds/next/activate", headers=h["admin"])
    assert (r.status_code, r.json()["currentRound"]) == (200, 2)
    assert db.table("tournaments").select("current_round").eq("id", env["tournament_id"]).execute().data[0]["current_round"] == 2
    [m2] = c.get("/admin/matches?status=ACTIVE", headers=h["admin"]).json()
    by_pid = {pid: name for name, pid in state["participant"].items()}
    home, away = by_pid[m2["home"]["participantId"]], by_pid[m2["away"]["participantId"]]

    assert c.post(f"/matches/{m2['id']}/finish", headers=h[home]).json()["homeScore"] == 0  # no events -> 0-0
    rejected = c.post(f"/matches/{m2['id']}/reject", headers=h[away])
    assert rejected.status_code == 200 and rejected.json()["status"] == "DISPUTED"

    blocked = c.post("/admin/rounds/next/activate", headers=h["admin"])
    assert (blocked.status_code, blocked.json()["error"]["code"]) == (409, "ROUND_NOT_CLOSED")
    assert c.post(f"/admin/matches/{m2['id']}/resolve", headers=h[home], json={"homeScore": 1, "awayScore": 0}).status_code == 403

    resolved = c.post(f"/admin/matches/{m2['id']}/resolve", headers=h["admin"],
                      json={"homeScore": 2, "awayScore": 1, "note": "revisado"})
    assert resolved.status_code == 200, resolved.text
    assert (resolved.json()["status"], resolved.json()["homeScore"], resolved.json()["resolutionNote"]) == \
        ("RESOLVED", 2, "revisado")
    row = db.table("matches").select("resolved_by,status").eq("id", m2["id"]).execute().data[0]
    assert row["status"] == "RESOLVED" and row["resolved_by"] == env["user_ids"][-1]
    assert c.post("/admin/rounds/next/activate", headers=h["admin"]).status_code == 200  # round 3 now opens


def test_squad_and_lineup(env):
    c, h = env["client"], env["h"]
    players = squad(env, "a")
    assert len(players) > 11 and all("photoUrl" in p for p in players)
    assert c.get("/lineups/me", headers=h["a"]).status_code == 404
    positions = [{"playerId": p["id"], "x": 0.5, "y": i / 11} for i, p in enumerate(players[:11])]
    saved = c.put("/lineups/me", headers=h["a"], json={"formation": "4-3-3", "positions": positions})
    assert saved.status_code == 200, saved.text
    assert len(c.get("/lineups/me", headers=h["a"]).json()["positions"]) == 11
    c.put("/lineups/me", headers=h["a"], json={"formation": "4-4-2", "positions": positions[:3]})  # replaces
    assert c.get("/lineups/me", headers=h["a"]).json()["formation"] == "4-4-2"
    assert c.get("/lineups/me", headers=h["b"]).status_code == 404  # private
    foreign = [{"playerId": squad(env, "b")[0]["id"], "x": 0.1, "y": 0.1}]
    r = c.put("/lineups/me", headers=h["a"], json={"formation": "4-4-2", "positions": foreign})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "PLAYER_NOT_IN_CLUB")
