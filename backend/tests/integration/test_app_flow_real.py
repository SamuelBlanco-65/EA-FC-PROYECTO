"""What the mobile app (Phase 8) calls, against the REAL Supabase: GET /participants/me before and after the
roulette, /media/* served from the private bucket, and the read endpoints behind Home / Tabla / Calendario.

Creates 1 tournament and 1 user; both are deleted at the end, each step on its own so one failure cannot
leave the others behind. Skip with: python -m pytest -m "not integration"
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

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


@pytest.fixture(scope="module")
def world():
    values = dotenv_values(ENV_PATH)
    url, key = (values.get("SUPABASE_URL") or ""), (values.get("SUPABASE_SECRET_KEY") or "")
    if not url or not key or "REPLACE_ME" in key or "YOUR-" in url:
        pytest.skip("backend/.env has no real SUPABASE_URL / SUPABASE_SECRET_KEY")
    admin = create_client(url, key, SyncClientOptions(auto_refresh_token=False, persist_session=False))
    if len(admin.table("clubs").select("id").execute().data) < 25:
        pytest.skip("needs the 25 seeded clubs")

    tag = uuid.uuid4().hex[:8]
    state: dict = {"user_id": None, "tournament_id": None}
    try:
        state["tournament_id"] = admin.table("tournaments").insert({"name": f"it-app-{tag}"}).execute().data[0]["id"]
        email, password = f"it-app-{tag}@example.com", "It!" + secrets.token_urlsafe(14)
        created = admin.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True, "user_metadata": {"display_name": "IT app"}})
        state["user_id"] = created.user.id
        client = TestClient(create_app())
        login = client.post("/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        yield {
            "client": client,
            "admin": admin,
            "headers": {"Authorization": f"Bearer {login.json()['accessToken']}"},
            "tournament_id": state["tournament_id"],
            "user_id": state["user_id"],
        }
    finally:
        # Independent steps: a failed delete must not stop the next one.
        if state["tournament_id"]:
            try:
                admin.table("tournaments").delete().eq("id", state["tournament_id"]).execute()
            except Exception as exc:  # noqa: BLE001
                print(f"CLEANUP FAILED tournament {state['tournament_id']}: {type(exc).__name__}")
        if state["user_id"]:
            try:
                admin.auth.admin.delete_user(state["user_id"])
            except Exception as exc:  # noqa: BLE001
                print(f"CLEANUP FAILED user {state['user_id']}: {type(exc).__name__}")


def test_participation_before_the_roulette_is_403_and_never_enrols(world):
    response = world["client"].get("/participants/me", headers=world["headers"])
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "NOT_A_PARTICIPANT"
    rows = world["admin"].table("tournament_participants").select("id").eq("tournament_id", world["tournament_id"]).execute().data
    assert rows == []  # the read-only endpoint did not assign a club


def test_assign_then_participation_returns_the_same_club(world):
    assigned = world["client"].post("/participants/me/assign-club", headers=world["headers"])
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["alreadyAssigned"] is False
    mine = world["client"].get("/participants/me", headers=world["headers"])
    assert mine.status_code == 200, mine.text
    assert mine.json()["club"]["id"] == assigned.json()["club"]["id"]
    assert mine.json()["participant"]["id"] == assigned.json()["participant"]["id"]
    world["club"] = mine.json()["club"]


def test_my_crest_is_served_from_the_private_bucket(world):
    club = world["club"]
    assert club["crestUrl"] == f"/media/crests/{club['id']}"
    response = world["client"].get(club["crestUrl"], headers=world["headers"])
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(PNG_MAGIC)
    again = world["client"].get(club["crestUrl"], headers={**world["headers"], "If-None-Match": response.headers["etag"]})
    assert again.status_code == 304


def test_media_requires_a_token_and_unknown_ids_are_404(world):
    client, club = world["client"], world["club"]
    assert client.get(club["crestUrl"]).status_code == 401
    missing = client.get(f"/media/crests/{uuid.uuid4()}", headers=world["headers"])
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "MEDIA_NOT_FOUND"


def test_a_player_photo_is_served(world):
    row = world["admin"].table("players").select("id").not_.is_("photo_path", "null").limit(1).execute().data[0]
    response = world["client"].get(f"/media/players/{row['id']}", headers=world["headers"])
    assert response.status_code == 200
    assert response.content.startswith(PNG_MAGIC)


def test_home_standings_and_calendar_reads(world):
    client, headers = world["client"], world["headers"]
    tournament = client.get("/tournament", headers=headers)
    assert tournament.status_code == 200 and tournament.json()["status"] == "DRAFT"
    standings = client.get("/tournament/standings", headers=headers)
    assert standings.status_code == 200
    assert [r["clubId"] for r in standings.json()] == [world["club"]["id"]]  # I am the only participant
    assert standings.json()[0]["points"] == 0
    fixtures = client.get("/tournament/fixtures", headers=headers)
    assert fixtures.status_code == 200 and fixtures.json() == []
