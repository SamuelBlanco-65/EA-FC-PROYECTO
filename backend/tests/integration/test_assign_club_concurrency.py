"""Club assignment under real concurrency, through the real HTTP stack and the real database.

26 temporary users sign in for real; 10 then 15 of them call POST /participants/me/assign-club at the
SAME instant (threads released by a barrier); the 26th must get a controlled TOURNAMENT_FULL.
Everything it creates (tournament, users) is deleted at the end.
Skip with: python -m pytest -m "not integration"
"""
import secrets
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

from app.core.config import ENV_PATH
from app.main import create_app

pytestmark = pytest.mark.integration

N_USERS = 26
FIRST_BATCH = 10
ASSIGN = "/participants/me/assign-club"


@pytest.fixture(scope="module")
def world():
    values = dotenv_values(ENV_PATH)
    url, key = (values.get("SUPABASE_URL") or ""), (values.get("SUPABASE_SECRET_KEY") or "")
    if not url or not key or "REPLACE_ME" in key or "YOUR-" in url:
        pytest.skip("backend/.env has no real SUPABASE_URL / SUPABASE_SECRET_KEY")
    admin = create_client(url, key, SyncClientOptions(auto_refresh_token=False, persist_session=False))
    pool = len(admin.table("clubs").select("id").execute().data)
    if pool < 25:
        pytest.skip(f"needs the 25 seeded clubs, found {pool}")

    app = create_app()
    tag = uuid.uuid4().hex[:8]
    user_ids: list[str] = []
    tournament_id = None
    try:
        tournament_id = admin.table("tournaments").insert({"name": f"it-assign-{tag}"}).execute().data[0]["id"]
        client = TestClient(app)
        tokens = []
        for n in range(N_USERS):
            email, password = f"it-assign-{tag}-{n}@example.com", "It!" + secrets.token_urlsafe(14)
            created = admin.auth.admin.create_user(
                {"email": email, "password": password, "email_confirm": True,
                 "user_metadata": {"display_name": f"IT assign {n}"}})
            user_ids.append(created.user.id)
            login = client.post("/auth/login", json={"email": email, "password": password})
            assert login.status_code == 200, login.text
            tokens.append(login.json()["accessToken"])
        yield {"app": app, "admin": admin, "tournament_id": tournament_id, "tokens": tokens, "user_ids": user_ids}
    finally:
        if tournament_id:
            admin.table("tournaments").delete().eq("id", tournament_id).execute()  # cascades to participants
        for uid in user_ids:
            admin.auth.admin.delete_user(uid)


def post_assign(app, token):
    with TestClient(app) as client:  # one client per thread
        return client.post(ASSIGN, headers={"Authorization": f"Bearer {token}"})


def assign_simultaneously(world, tokens):
    barrier = threading.Barrier(len(tokens))

    def call(token):
        barrier.wait()
        return post_assign(world["app"], token)

    with ThreadPoolExecutor(max_workers=len(tokens)) as pool:
        return list(pool.map(call, tokens))


def db_participants(world):
    rows = world["admin"].table("tournament_participants").select("club_id,user_id") \
        .eq("tournament_id", world["tournament_id"]).execute().data
    return rows


def test_10_simultaneous_users_get_10_distinct_clubs(world):
    responses = assign_simultaneously(world, world["tokens"][:FIRST_BATCH])
    assert [r.status_code for r in responses] == [200] * FIRST_BATCH, [r.text for r in responses]
    clubs = [r.json()["club"]["id"] for r in responses]
    assert len(set(clubs)) == FIRST_BATCH, "a club was assigned twice"
    assert all(r.json()["alreadyAssigned"] is False for r in responses)
    rows = db_participants(world)
    assert len(rows) == FIRST_BATCH and len({r["club_id"] for r in rows}) == FIRST_BATCH
    assert all(len(r.json()["rouletteClubs"]) == 25 for r in responses)


def test_repeating_the_call_returns_the_same_club(world):
    token = world["tokens"][0]
    first, second = post_assign(world["app"], token), post_assign(world["app"], token)
    assert second.status_code == 200
    assert second.json()["alreadyAssigned"] is True
    assert second.json()["club"]["id"] == first.json()["club"]["id"]
    assert len(db_participants(world)) == FIRST_BATCH  # no extra row


def test_remaining_15_fill_the_tournament_with_25_distinct_clubs(world):
    responses = assign_simultaneously(world, world["tokens"][FIRST_BATCH:25])
    assert [r.status_code for r in responses] == [200] * 15, [r.text for r in responses]
    rows = db_participants(world)
    assert len(rows) == 25 and len({r["club_id"] for r in rows}) == 25


def test_the_26th_user_gets_a_controlled_tournament_full(world):
    response = post_assign(world["app"], world["tokens"][25])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TOURNAMENT_FULL"
    assert len(db_participants(world)) == 25  # nothing was inserted


def test_read_endpoints_against_the_filled_tournament(world):
    headers = {"Authorization": f"Bearer {world['tokens'][0]}"}
    with TestClient(world["app"]) as client:
        tournament = client.get("/tournament", headers=headers).json()
        standings = client.get("/tournament/standings", headers=headers).json()
        fixtures = client.get("/tournament/fixtures", headers=headers).json()
    assert tournament["id"] == world["tournament_id"]
    assert tournament["participantCount"] == 25 and tournament["status"] == "DRAFT"
    assert len(standings) == 25
    assert [r["position"] for r in standings] == list(range(1, 26))
    assert all(r["points"] == 0 and r["played"] == 0 for r in standings)
    assert [r["clubName"] for r in standings] == sorted(r["clubName"] for r in standings)  # name tiebreak only
    assert fixtures == []  # matches exist only after the admin starts the tournament
