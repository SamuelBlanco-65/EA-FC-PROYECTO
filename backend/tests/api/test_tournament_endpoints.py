"""Hermetic tests of /tournament/* and /participants/me/assign-club: real JWT validation and
routers/services, fake repositories (no Supabase)."""
import uuid
from datetime import UTC, datetime

import pytest

from app.api.deps import get_club_repository, get_participant_repository, get_tournament_repository
from app.core.errors import AppError
from app.domain.tournament import (
    Club, ClubRef, Match, MatchStatus, Participant, StandingRow, Tournament, TournamentStatus,
)
from app.domain.user import UserRole

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
TOURNAMENT = Tournament(
    id=uuid.uuid4(), name="Copa", status=TournamentStatus.DRAFT, current_round=0,
    max_participants=25, participant_count=2, started_at=None,
)
CLUBS = [
    Club(uuid.uuid4(), f"Club {i}", f"C{i}", "League", "Land", "#112233", "#ffffff") for i in range(3)
]


class FakeTournaments:
    def __init__(self):
        self.tournament = TOURNAMENT
        self.standings: list[StandingRow] = []
        self.matches: list[Match] = []

    def get_current(self, token):
        return self.tournament

    def get_standings(self, tournament_id, token):
        return self.standings

    def get_matches(self, tournament_id, clubs, token):
        return self.matches


class FakeParticipants:
    def __init__(self):
        self.by_user: dict[uuid.UUID, Participant] = {}
        self.rpc_calls = 0
        self.fail_with: AppError | None = None
        self.refs: dict[uuid.UUID, ClubRef] = {}

    def find_own(self, tournament_id, user_id, token):
        return self.by_user.get(user_id)

    def club_refs(self, tournament_id, token):
        return self.refs

    def assign_random_club(self, tournament_id, user_id):
        self.rpc_calls += 1
        if self.fail_with:
            raise self.fail_with
        p = Participant(uuid.uuid4(), tournament_id, CLUBS[len(self.by_user) % len(CLUBS)].id, NOW)
        self.by_user[user_id] = p
        return p


class FakeClubs:
    def list_all(self, token):
        return CLUBS


@pytest.fixture
def tournaments(app):
    fake = FakeTournaments()
    app.dependency_overrides[get_tournament_repository] = lambda: fake
    return fake


@pytest.fixture
def participants(app):
    fake = FakeParticipants()
    app.dependency_overrides[get_participant_repository] = lambda: fake
    return fake


@pytest.fixture(autouse=True)
def clubs(app):
    app.dependency_overrides[get_club_repository] = lambda: FakeClubs()


@pytest.fixture
def user(profiles, make_token, auth_header):
    uid = profiles.add(UserRole.PARTICIPANT)
    return uid, auth_header(make_token(uid))


ENDPOINTS = [
    ("get", "/tournament"),
    ("get", "/tournament/standings"),
    ("get", "/tournament/fixtures"),
    ("post", "/participants/me/assign-club"),
]


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_requires_authentication(client, tournaments, participants, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_get_tournament(client, tournaments, user):
    _, headers = user
    body = client.get("/tournament", headers=headers).json()
    assert body["name"] == "Copa"
    assert body["status"] == "DRAFT"
    assert body["participantCount"] == 2
    assert body["maxParticipants"] == 25
    assert body["currentRound"] == 0
    assert body["startedAt"] is None


@pytest.mark.parametrize("path", ["/tournament", "/tournament/standings", "/tournament/fixtures"])
def test_no_tournament_is_404(client, tournaments, user, path):
    tournaments.tournament = None
    response = client.get(path, headers=user[1])
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_standings_pass_through(client, tournaments, user):
    club = CLUBS[0]
    tournaments.standings = [
        StandingRow(1, uuid.uuid4(), club.id, club.name, club.short_name, 2, 2, 0, 0, 5, 1, 4, 6),
    ]
    rows = client.get("/tournament/standings", headers=user[1]).json()
    assert rows[0]["position"] == 1
    assert rows[0]["points"] == 6
    assert rows[0]["goalDifference"] == 4
    assert rows[0]["crestUrl"] == f"/media/crests/{club.id}"


def test_empty_fixtures_in_draft(client, tournaments, participants, user):
    assert client.get("/tournament/fixtures", headers=user[1]).json() == []


def test_fixtures_shape(client, tournaments, participants, user):
    home = ClubRef(uuid.uuid4(), CLUBS[0].id, "Club 0", "C0")
    away = ClubRef(uuid.uuid4(), CLUBS[1].id, "Club 1", "C1")
    tournaments.matches = [Match(uuid.uuid4(), 1, 1, MatchStatus.SCHEDULED, home, away, None, None)]
    [match] = client.get("/tournament/fixtures", headers=user[1]).json()
    assert (match["round"], match["leg"], match["status"]) == (1, 1, "SCHEDULED")
    assert match["home"]["name"] == "Club 0" and match["away"]["shortName"] == "C1"
    assert match["homeScore"] is None and match["awayScore"] is None


def test_assign_club_returns_club_and_roulette_pool(client, tournaments, participants, user):
    uid, headers = user
    response = client.post("/participants/me/assign-club", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["alreadyAssigned"] is False
    assert body["participant"]["tournamentId"] == str(TOURNAMENT.id)
    assert body["club"]["id"] in [c["id"] for c in body["rouletteClubs"]]
    assert len(body["rouletteClubs"]) == len(CLUBS)
    assert participants.rpc_calls == 1


def test_assign_club_is_idempotent(client, tournaments, participants, user):
    _, headers = user
    first = client.post("/participants/me/assign-club", headers=headers).json()
    second = client.post("/participants/me/assign-club", headers=headers).json()
    assert second["alreadyAssigned"] is True
    assert second["club"]["id"] == first["club"]["id"]
    assert second["participant"]["id"] == first["participant"]["id"]
    assert participants.rpc_calls == 1  # the second call never reaches the SQL function


def test_client_cannot_choose_the_club(client, tournaments, participants, user):
    _, headers = user
    wanted = str(CLUBS[2].id)
    body = client.post("/participants/me/assign-club", headers=headers, json={"clubId": wanted}).json()
    assert body["club"]["id"] != wanted  # first user gets CLUBS[0] from the fake; the body is ignored


def test_assign_uses_user_from_the_token(client, tournaments, participants, user):
    uid, headers = user
    client.post("/participants/me/assign-club", headers=headers)
    assert list(participants.by_user) == [uid]


@pytest.mark.parametrize(
    ("code", "status"),
    [
        ("TOURNAMENT_FULL", 409),
        ("TOURNAMENT_NOT_DRAFT", 409),
        ("NO_FREE_CLUBS", 409),
        ("ASSIGNMENT_RETRIES_EXHAUSTED", 503),
    ],
)
def test_assign_errors_keep_stable_codes(client, tournaments, participants, user, code, status):
    participants.fail_with = AppError(code, "msg", status)
    response = client.post("/participants/me/assign-club", headers=user[1])
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
