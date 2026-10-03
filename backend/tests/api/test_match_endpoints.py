"""Events, finish, confirm, reject, resolve and detail. Real JWT/router/service; in-memory repositories."""
import uuid
from dataclasses import replace

import pytest
from fake_world import S, event_body

from app.domain.match import EventType


@pytest.fixture
def game(world):
    """Home (A) vs away (B) with the match ACTIVE in the active round, plus a third enrolled player C."""
    home, away, other = world.participant("Alpha"), world.participant("Bravo"), world.participant("Charlie")
    match = world.add_match(1, 1, home.pid, away.pid, S.ACTIVE)
    world.home, world.away, world.other, world.match = home, away, other, match
    return world


def status_of(world):
    return world.matches[world.match.id].status


def post(client, path, actor, **kw):
    return client.post(path, headers=actor.headers, **kw)


# ---- events -----------------------------------------------------------------------------------

def test_home_records_a_goal(client, game):
    body = event_body(game.home, minute=23)
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    assert response.status_code == 201
    data = response.json()
    assert data["alreadyRecorded"] is False
    assert (data["id"], data["type"], data["minute"]) == (body["id"], "GOAL", 23)
    assert data["playerName"] == game.home.players[0].name
    assert uuid.UUID(body["id"]) in game.events


def test_resending_the_same_event_does_not_duplicate_it(client, game):  # REQUIRED
    body = event_body(game.home)
    first = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    second = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    third = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    assert (first.status_code, second.status_code, third.status_code) == (201, 200, 200)
    assert second.json()["alreadyRecorded"] is True
    assert second.json()["id"] == first.json()["id"]
    assert len(game.events) == 1
    assert game.matches_repo.insert_calls == 1  # replays are answered before touching the table


def test_replay_still_succeeds_after_the_match_left_active(client, game):
    body = event_body(game.home)
    post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    post(client, f"/matches/{game.match.id}/finish", game.home)
    assert status_of(game) is S.PENDING_CONFIRMATION
    replay = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    assert replay.status_code == 200 and replay.json()["alreadyRecorded"] is True
    assert len(game.events) == 1


def test_same_event_id_with_different_data_is_a_conflict(client, game):
    body = event_body(game.home, minute=10)
    post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    response = post(client, f"/matches/{game.match.id}/events", game.home, json={**body, "minute": 11})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_ID_CONFLICT"
    assert game.events[uuid.UUID(body["id"])].minute == 10


def test_away_cannot_reuse_an_event_id_of_the_home_team(client, game):
    body = event_body(game.home)
    post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    stolen = event_body(game.away, event_id=body["id"])
    response = post(client, f"/matches/{game.match.id}/events", game.away, json=stolen)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVENT_ID_CONFLICT"
    assert len(game.events) == 1


def test_visitor_cannot_record_events_for_the_home_team_even_if_the_request_is_tampered(client, game):  # REQUIRED
    path = f"/matches/{game.match.id}/events"
    # 1) claims to be the home participant, with a home player
    tampered = event_body(game.home)
    r1 = post(client, path, game.away, json=tampered)
    # 2) claims to be the home participant, with one of his OWN players
    r2 = post(client, path, game.away, json=event_body(game.away, participant_id=game.home.pid))
    # 3) honest participant id, but a home player
    r3 = post(client, path, game.away, json=event_body(game.away, player=game.home.players[0]))
    assert (r1.status_code, r1.json()["error"]["code"]) == (403, "NOT_YOUR_TEAM")
    assert (r2.status_code, r2.json()["error"]["code"]) == (403, "NOT_YOUR_TEAM")
    assert (r3.status_code, r3.json()["error"]["code"]) == (422, "PLAYER_NOT_IN_CLUB")
    assert game.events == {}


def test_player_of_another_club_is_rejected(client, game):
    body = event_body(game.home, player=game.other.players[0])
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "PLAYER_NOT_IN_CLUB")


def test_unknown_player_is_rejected(client, game):
    body = {**event_body(game.home), "playerId": str(uuid.uuid4())}
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=body)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "PLAYER_NOT_IN_CLUB")


def test_participant_who_does_not_play_the_match_is_rejected(client, game):
    response = post(client, f"/matches/{game.match.id}/events", game.other, json=event_body(game.other))
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_IN_MATCH")
    assert game.events == {}


@pytest.mark.parametrize("who", ["outsider", "admin"])
def test_user_who_is_not_enrolled_cannot_record(client, game, who):
    actor = getattr(game, who)()
    body = event_body(game.home)
    response = post(client, f"/matches/{game.match.id}/events", actor, json=body)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_A_PARTICIPANT")
    assert game.events == {}


@pytest.mark.parametrize("minute", [0, -1, 121, 500])
def test_minute_out_of_range(client, game, minute):
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=event_body(game.home, minute=minute))
    assert (response.status_code, response.json()["error"]["code"]) == (422, "INVALID_MINUTE")
    assert game.events == {}


@pytest.mark.parametrize("minute", [1, 90, 120])
def test_minute_bounds_are_accepted(client, game, minute):
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=event_body(game.home, minute=minute))
    assert response.status_code == 201


@pytest.mark.parametrize("status", [S.SCHEDULED, S.PENDING_CONFIRMATION, S.CONFIRMED, S.DISPUTED, S.RESOLVED])
def test_events_only_while_match_is_active(client, game, status):
    m = game.add_match(1, 2, game.home.pid, game.other.pid, status)
    response = post(client, f"/matches/{m.id}/events", game.home, json=event_body(game.home))
    assert (response.status_code, response.json()["error"]["code"]) == (409, "MATCH_NOT_ACTIVE")
    assert game.events == {}


def test_events_only_in_the_active_round(client, game):
    game.set_tournament(current_round=2)  # the ACTIVE match belongs to round 1
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=event_body(game.home))
    assert (response.status_code, response.json()["error"]["code"]) == (409, "ROUND_NOT_ACTIVE")
    assert game.events == {}


def test_unknown_event_type_is_a_validation_error(client, game):
    response = post(client, f"/matches/{game.match.id}/events", game.home, json=event_body(game.home, type_="PENALTY"))
    assert (response.status_code, response.json()["error"]["code"]) == (422, "VALIDATION_ERROR")


def test_events_endpoint_errors(client, game):
    body = event_body(game.home)
    assert client.post(f"/matches/{game.match.id}/events", json=body).status_code == 401
    missing = post(client, f"/matches/{uuid.uuid4()}/events", game.home, json=body)
    assert (missing.status_code, missing.json()["error"]["code"]) == (404, "MATCH_NOT_FOUND")
    assert post(client, "/matches/not-a-uuid/events", game.home, json=body).status_code == 422


# ---- detail -----------------------------------------------------------------------------------

def test_detail_includes_teams_and_events(client, game):
    game.add_event(game.match, game.home, EventType.GOAL, 30)
    game.add_event(game.match, game.away, EventType.YELLOW, 12)
    data = client.get(f"/matches/{game.match.id}", headers=game.other.headers).json()  # anyone enrolled may read
    assert data["status"] == "ACTIVE" and data["homeScore"] is None
    assert data["home"]["name"] == "Club Alpha" and data["away"]["name"] == "Club Bravo"
    assert [(e["type"], e["minute"]) for e in data["events"]] == [("YELLOW", 12), ("GOAL", 30)]
    assert data["events"][0]["playerName"].startswith("Bravo")


def test_detail_errors(client, game):
    assert client.get(f"/matches/{game.match.id}").status_code == 401
    r = client.get(f"/matches/{uuid.uuid4()}", headers=game.home.headers)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "MATCH_NOT_FOUND")


# ---- finish -----------------------------------------------------------------------------------

def test_home_finishes_and_the_server_derives_the_score(client, game):
    for actor, type_, minute in [
        (game.home, EventType.GOAL, 5), (game.home, EventType.GOAL, 50), (game.away, EventType.GOAL, 70),
        (game.home, EventType.YELLOW, 20), (game.away, EventType.RED, 80),
    ]:
        game.add_event(game.match, actor, type_, minute)
    # The client cannot choose the score: any body is ignored.
    response = post(client, f"/matches/{game.match.id}/finish", game.home, json={"homeScore": 9, "awayScore": 0})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "PENDING_CONFIRMATION"
    assert (data["homeScore"], data["awayScore"]) == (2, 1)
    assert data["finishedAt"] is not None
    assert len(data["events"]) == 5


def test_finish_with_no_events_is_zero_zero(client, game):
    data = post(client, f"/matches/{game.match.id}/finish", game.home).json()
    assert (data["homeScore"], data["awayScore"]) == (0, 0)


def test_visitor_cannot_finish(client, game):  # REQUIRED
    response = post(client, f"/matches/{game.match.id}/finish", game.away)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_MATCH_HOME")
    assert status_of(game) is S.ACTIVE
    assert game.matches[game.match.id].home_score is None


def test_participant_outside_the_match_cannot_finish(client, game):
    response = post(client, f"/matches/{game.match.id}/finish", game.other)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_IN_MATCH")
    assert status_of(game) is S.ACTIVE


@pytest.mark.parametrize("who", ["outsider", "admin"])
def test_not_enrolled_cannot_finish(client, game, who):
    response = post(client, f"/matches/{game.match.id}/finish", getattr(game, who)())
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_A_PARTICIPANT")


def test_finish_requires_authentication(client, game):
    assert client.post(f"/matches/{game.match.id}/finish").status_code == 401


@pytest.mark.parametrize("status", [S.SCHEDULED, S.PENDING_CONFIRMATION, S.CONFIRMED, S.DISPUTED, S.RESOLVED])
def test_cannot_finish_from_another_status(client, game, status):
    m = game.add_match(1, 2, game.home.pid, game.other.pid, status)
    response = post(client, f"/matches/{m.id}/finish", game.home)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "INVALID_TRANSITION")
    assert game.matches[m.id].status is status


def test_finish_loses_the_race_when_the_status_changed_meanwhile(client, game):
    game.matches_repo.before_transition = lambda: game.matches.update(
        {game.match.id: replace(game.matches[game.match.id], status=S.RESOLVED)}
    )
    response = post(client, f"/matches/{game.match.id}/finish", game.home)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "MATCH_STATE_CHANGED")
    assert status_of(game) is S.RESOLVED  # untouched by the losing request


# ---- confirm / reject -------------------------------------------------------------------------

@pytest.fixture
def pending(game):
    game.add_event(game.match, game.home, EventType.GOAL, 10)
    post_finish = game.matches_repo.transition(game.match.id, S.ACTIVE, {
        "status": "PENDING_CONFIRMATION", "home_score": 1, "away_score": 0, "finished_at": "2026-10-03T12:00:00+00:00"})
    assert post_finish is not None
    return game


def test_visitor_confirms(client, pending):
    response = post(client, f"/matches/{pending.match.id}/confirm", pending.away)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CONFIRMED" and data["confirmedAt"] is not None
    assert (data["homeScore"], data["awayScore"]) == (1, 0)


def test_visitor_rejects(client, pending):
    data = post(client, f"/matches/{pending.match.id}/reject", pending.away).json()
    assert data["status"] == "DISPUTED"
    assert (data["homeScore"], data["awayScore"]) == (1, 0)


@pytest.mark.parametrize("action", ["confirm", "reject"])
def test_home_cannot_confirm_or_reject_its_own_result(client, pending, action):  # REQUIRED
    response = post(client, f"/matches/{pending.match.id}/{action}", pending.home)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_MATCH_AWAY")
    assert status_of(pending) is S.PENDING_CONFIRMATION


@pytest.mark.parametrize("action", ["confirm", "reject"])
def test_uninvolved_users_cannot_confirm_or_reject(client, pending, action):
    other = post(client, f"/matches/{pending.match.id}/{action}", pending.other)
    admin = post(client, f"/matches/{pending.match.id}/{action}", pending.admin())
    assert (other.status_code, other.json()["error"]["code"]) == (403, "NOT_IN_MATCH")
    assert (admin.status_code, admin.json()["error"]["code"]) == (403, "NOT_A_PARTICIPANT")
    assert status_of(pending) is S.PENDING_CONFIRMATION


@pytest.mark.parametrize("action", ["confirm", "reject"])
@pytest.mark.parametrize("status", [S.SCHEDULED, S.ACTIVE, S.CONFIRMED, S.DISPUTED, S.RESOLVED])
def test_cannot_respond_from_another_status(client, game, action, status):
    m = game.add_match(1, 2, game.other.pid, game.home.pid, status)  # home is the visitor here
    response = post(client, f"/matches/{m.id}/{action}", game.home)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "INVALID_TRANSITION")
    assert game.matches[m.id].status is status


def test_answering_twice_is_rejected(client, pending):
    assert post(client, f"/matches/{pending.match.id}/confirm", pending.away).status_code == 200
    again = post(client, f"/matches/{pending.match.id}/reject", pending.away)
    assert (again.status_code, again.json()["error"]["code"]) == (409, "INVALID_TRANSITION")
    assert status_of(pending) is S.CONFIRMED


# ---- admin resolve ----------------------------------------------------------------------------

@pytest.mark.parametrize("status", [S.DISPUTED, S.PENDING_CONFIRMATION])
def test_admin_resolves(client, game, status):
    m = game.add_match(1, 2, game.home.pid, game.other.pid, status, home_score=2, away_score=2)
    admin = game.admin()
    response = post(client, f"/admin/matches/{m.id}/resolve", admin, json={"homeScore": 3, "awayScore": 1, "note": "VAR"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "RESOLVED"
    assert (data["homeScore"], data["awayScore"], data["resolutionNote"]) == (3, 1, "VAR")


@pytest.mark.parametrize("status", [S.SCHEDULED, S.ACTIVE, S.CONFIRMED, S.RESOLVED])
def test_admin_cannot_resolve_from_another_status(client, game, status):
    m = game.add_match(1, 2, game.home.pid, game.other.pid, status)
    response = post(client, f"/admin/matches/{m.id}/resolve", game.admin(), json={"homeScore": 1, "awayScore": 0})
    assert (response.status_code, response.json()["error"]["code"]) == (409, "INVALID_TRANSITION")
    assert game.matches[m.id].status is status


def test_participant_cannot_resolve(client, game):
    m = game.add_match(1, 2, game.home.pid, game.other.pid, S.DISPUTED, home_score=1, away_score=1)
    response = post(client, f"/admin/matches/{m.id}/resolve", game.home, json={"homeScore": 5, "awayScore": 0})
    assert (response.status_code, response.json()["error"]["code"]) == (403, "FORBIDDEN")
    assert game.matches[m.id].status is S.DISPUTED


@pytest.mark.parametrize("body", [{"homeScore": -1, "awayScore": 0}, {"homeScore": 1}, {"homeScore": 1, "awayScore": 100}])
def test_resolve_validates_the_score(client, game, body):
    m = game.add_match(1, 2, game.home.pid, game.other.pid, S.DISPUTED, home_score=1, away_score=1)
    response = post(client, f"/admin/matches/{m.id}/resolve", game.admin(), json=body)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "VALIDATION_ERROR")
