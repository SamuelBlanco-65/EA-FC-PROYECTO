"""Start tournament, activate rounds, admin lists. Real JWT/router/service; in-memory repositories."""
import uuid
from collections import Counter
from dataclasses import replace

import pytest
from fake_world import S

from app.domain.round_robin import match_count, round_count
from app.domain.tournament import TournamentStatus

ADMIN_ROUTES = [
    ("post", "/admin/tournament/start", None),
    ("post", "/admin/rounds/next/activate", None),
    ("get", "/admin/matches", None),
    ("get", "/admin/participants", None),
    ("post", f"/admin/matches/{uuid.uuid4()}/resolve", {"homeScore": 1, "awayScore": 0}),
]


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
def test_admin_routes_need_a_token(client, world, method, path, body):
    response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
def test_admin_routes_reject_participants(client, world, method, path, body):
    player = world.participant("Alpha")
    kwargs = {"headers": player.headers, **({"json": body} if body else {})}
    response = getattr(client, method)(path, **kwargs)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "FORBIDDEN")
    assert world.start_calls == world.activate_calls == 0


# ---- start ------------------------------------------------------------------------------------

@pytest.fixture
def draft(world):
    world.set_tournament(status=TournamentStatus.DRAFT, current_round=0, started_at=None)
    return world


@pytest.mark.parametrize("n", [2, 3, 4, 5])
def test_start_generates_the_double_round_robin(client, draft, n):
    for i in range(n):
        draft.participant(f"P{i}")
    response = client.post("/admin/tournament/start", headers=draft.admin().headers)
    assert response.status_code == 200
    data = response.json()
    assert data["matchCount"] == match_count(n) == len(draft.matches)
    assert data["roundCount"] == round_count(n)
    assert data["participantCount"] == n
    assert data["tournament"]["status"] == "ACTIVE" and data["tournament"]["currentRound"] == 0
    assert {m.status for m in draft.matches.values()} == {S.SCHEDULED}  # nothing is active until the admin activates round 1
    pairs = Counter((m.home_participant_id, m.away_participant_id) for m in draft.matches.values())
    assert set(pairs.values()) == {1} and len(pairs) == n * (n - 1)  # every ordered pair exactly once


def test_start_needs_two_participants(client, draft):
    draft.participant("Alone")
    response = client.post("/admin/tournament/start", headers=draft.admin().headers)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "NOT_ENOUGH_PARTICIPANTS")
    assert draft.matches == {} and draft.tournament.status is TournamentStatus.DRAFT


def test_start_twice_is_rejected(client, draft):
    draft.participant("A"), draft.participant("B")
    admin = draft.admin()
    assert client.post("/admin/tournament/start", headers=admin.headers).status_code == 200
    again = client.post("/admin/tournament/start", headers=admin.headers)
    assert (again.status_code, again.json()["error"]["code"]) == (409, "TOURNAMENT_ALREADY_STARTED")
    assert len(draft.matches) == 2 and draft.start_calls == 1


def test_start_without_tournament(client, draft):
    draft.tournaments.get_current = lambda token: None
    response = client.post("/admin/tournament/start", headers=draft.admin().headers)
    assert (response.status_code, response.json()["error"]["code"]) == (404, "TOURNAMENT_NOT_FOUND")


# ---- activate rounds --------------------------------------------------------------------------

@pytest.fixture
def started(client, world):
    """Three players -> 6 rounds of 1 match each. Tournament ACTIVE at round 0."""
    world.set_tournament(status=TournamentStatus.DRAFT, current_round=0, started_at=None)
    for name in "ABC":
        world.participant(name)
    world.the_admin = world.admin()
    assert client.post("/admin/tournament/start", headers=world.the_admin.headers).status_code == 200
    return world


def matches_of(world, round_):
    return [m for m in world.matches.values() if m.round == round_]


def activate(client, world):
    return client.post("/admin/rounds/next/activate", headers=world.the_admin.headers)


def test_activate_first_round(client, started):
    response = activate(client, started)
    assert response.status_code == 200
    assert response.json() == {"currentRound": 1, "activatedMatches": 1}
    assert {m.status for m in matches_of(started, 1)} == {S.ACTIVE}
    assert {m.status for m in matches_of(started, 2)} == {S.SCHEDULED}


def test_round_two_is_blocked_while_round_one_has_open_matches(client, started):  # REQUIRED
    activate(client, started)
    [m1] = matches_of(started, 1)
    for status in (S.ACTIVE, S.PENDING_CONFIRMATION, S.DISPUTED):
        started.matches[m1.id] = replace(m1, status=status)
        response = activate(client, started)
        assert (response.status_code, response.json()["error"]["code"]) == (409, "ROUND_NOT_CLOSED")
        assert response.json()["error"]["details"] == {"round": 1, "openMatches": 1}
        assert started.tournament.current_round == 1
        assert {m.status for m in matches_of(started, 2)} == {S.SCHEDULED}
    assert started.activate_calls == 1  # only the first activation reached the SQL function


@pytest.mark.parametrize("closed", [S.CONFIRMED, S.RESOLVED])
def test_round_two_activates_once_round_one_is_closed(client, started, closed):
    activate(client, started)
    [m1] = matches_of(started, 1)
    started.matches[m1.id] = replace(m1, status=closed, home_score=1, away_score=0)
    response = activate(client, started)
    assert response.status_code == 200 and response.json()["currentRound"] == 2
    assert {m.status for m in matches_of(started, 2)} == {S.ACTIVE}


def test_cannot_activate_beyond_the_last_round(client, started):
    started.set_tournament(current_round=6)
    for m in started.matches.values():
        started.matches[m.id] = replace(m, status=S.CONFIRMED, home_score=0, away_score=0)
    response = activate(client, started)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "NO_MORE_ROUNDS")


def test_cannot_activate_a_draft_tournament(client, world):
    world.set_tournament(status=TournamentStatus.DRAFT, current_round=0, started_at=None)
    response = client.post("/admin/rounds/next/activate", headers=world.admin().headers)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "TOURNAMENT_NOT_ACTIVE")


# ---- lists ------------------------------------------------------------------------------------

def test_admin_matches_filter_by_status(client, world):
    a, b, c = world.participant("A"), world.participant("B"), world.participant("C")
    world.add_match(1, 1, a.pid, b.pid, S.ACTIVE)
    world.add_match(1, 2, b.pid, c.pid, S.DISPUTED, home_score=1, away_score=1)
    world.add_match(2, 1, c.pid, a.pid, S.SCHEDULED)
    admin = world.admin()
    everything = client.get("/admin/matches", headers=admin.headers).json()
    disputed = client.get("/admin/matches?status=DISPUTED", headers=admin.headers).json()
    assert len(everything) == 3
    assert [(m["status"], m["homeScore"]) for m in disputed] == [("DISPUTED", 1)]
    assert disputed[0]["home"]["name"] == "Club B"


def test_admin_matches_rejects_unknown_status(client, world):
    response = client.get("/admin/matches?status=BOGUS", headers=world.admin().headers)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "VALIDATION_ERROR")


def test_admin_participants(client, world):
    world.participant("Ana"), world.participant("Beto")
    rows = client.get("/admin/participants", headers=world.admin().headers).json()
    assert [(r["displayName"], r["club"]["name"]) for r in rows] == [("Ana", "Club Ana"), ("Beto", "Club Beto")]
    assert set(rows[0]) == {"id", "userId", "displayName", "club", "joinedAt"}
