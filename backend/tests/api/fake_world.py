"""In-memory stand-ins for the repositories, shared by the phase 5 API tests.

Real JWT validation, routers and services run; only the data layer is replaced. The fakes copy the
database behaviours the services rely on (ON CONFLICT DO NOTHING, `WHERE status = <expected>`, the two
SQL functions) but deliberately NOT the RLS policies: the tests must prove that the SERVICE rejects bad
requests by itself.
"""
import uuid
from dataclasses import dataclass, replace
from datetime import UTC, datetime

from app.api.deps import (
    get_lineup_repository, get_match_repository, get_participant_repository, get_player_repository,
    get_tournament_repository,
)
from app.core.errors import AppError
from app.domain.match import EventType, Lineup, LineupSlot, MatchEvent, MatchRecord, Player
from app.domain.round_robin import Fixture
from app.domain.tournament import (
    AdminParticipant, ClubRef, MatchStatus, Participant, Tournament, TournamentStatus,
)
from app.domain.user import UserRole

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
S = MatchStatus


@dataclass
class Actor:
    """A test user: token headers + the participant row (None for admin / non-participants)."""

    user_id: uuid.UUID
    headers: dict
    participant: Participant | None = None
    players: list[Player] | None = None

    @property
    def pid(self) -> uuid.UUID:
        return self.participant.id


class FakeTournaments:
    def __init__(self, world):
        self.w = world

    def get_current(self, token):
        return self.w.tournament

    def start(self, tournament_id, fixtures: list[Fixture]):
        # Same contract as the SQL function start_tournament.
        if self.w.tournament.status is not TournamentStatus.DRAFT:
            raise AppError("TOURNAMENT_NOT_DRAFT", "El torneo ya inició.", 409)
        self.w.start_calls += 1
        self.w.tournament = replace(self.w.tournament, status=TournamentStatus.ACTIVE, current_round=0, started_at=NOW)
        for f in fixtures:
            self.w.add_match(f.round, f.leg, f.home, f.away, S.SCHEDULED)

    def activate_round(self, tournament_id, expected_round):
        # Same contract as the SQL function activate_round.
        t = self.w.tournament
        if t.status is not TournamentStatus.ACTIVE or t.current_round != expected_round:
            raise AppError("ROUND_CHANGED", "La fecha activa cambió.", 409)
        if any(m.round == expected_round and m.status not in (S.CONFIRMED, S.RESOLVED) for m in self.w.matches.values()):
            raise AppError("ROUND_NOT_CLOSED", "Hay partidos sin cerrar.", 409)
        self.w.activate_calls += 1
        new = expected_round + 1
        self.w.tournament = replace(t, current_round=new)
        for mid, m in list(self.w.matches.items()):
            if m.round == new and m.status is S.SCHEDULED:
                self.w.matches[mid] = replace(m, status=S.ACTIVE)
        return new


class FakeParticipants:
    def __init__(self, world):
        self.w = world

    def find_own(self, tournament_id, user_id, token):
        return self.w.participants.get(user_id)

    def club_refs(self, tournament_id, token):
        return {p.id: self.w.refs[p.id] for p in self.w.participants.values()}

    def list_for_admin(self, tournament_id):
        return [
            AdminParticipant(p.id, uid, self.w.names[uid], self.w.refs[p.id], NOW)
            for uid, p in self.w.participants.items()
        ]


class FakeMatches:
    def __init__(self, world):
        self.w = world
        self.before_transition = None  # hook to simulate "someone else moved the match first"
        self.insert_calls = 0

    def get(self, match_id, token):
        return self.w.matches.get(match_id)

    def list_for_tournament(self, tournament_id, token, status=None):
        rows = sorted(self.w.matches.values(), key=lambda m: (m.round, m.leg))
        return [m for m in rows if status is None or m.status is status]

    def list_events(self, match_id, token):
        return sorted((e for e in self.w.events.values() if e.match_id == match_id), key=lambda e: e.minute)

    def get_event(self, event_id, token):
        return self.w.events.get(event_id)

    def insert_event(self, *, event_id, match_id, participant_id, player_id, type, minute, created_by, access_token):
        self.insert_calls += 1
        if event_id in self.w.events:  # ON CONFLICT (id) DO NOTHING
            return False
        player = self.w.all_players[player_id]
        self.w.events[event_id] = MatchEvent(
            event_id, match_id, participant_id, player_id, player.name, EventType(type), minute, NOW)
        return True

    def transition(self, match_id, expected_status, changes):
        if self.before_transition:
            self.before_transition()
        m = self.w.matches[match_id]
        if m.status is not expected_status:  # WHERE id = ? AND status = <expected> -> 0 rows
            return None
        fields = dict(changes)
        fields["status"] = MatchStatus(fields["status"])
        for key in ("finished_at", "confirmed_at"):
            if key in fields:
                fields[key] = datetime.fromisoformat(fields[key])
        fields.pop("resolved_by", None)
        updated = replace(m, **fields)
        self.w.matches[match_id] = updated
        return updated


class FakePlayers:
    def __init__(self, world):
        self.w = world

    def list_by_club(self, club_id, token):
        return [p for p in self.w.all_players.values() if p.club_id == club_id]

    def get(self, player_id, token):
        return self.w.all_players.get(player_id)


class FakeLineups:
    def __init__(self, world):
        self.w = world

    def get(self, participant_id, token):
        return self.w.lineups.get(participant_id)

    def upsert(self, participant_id, formation, positions: list[LineupSlot], token):
        lineup = Lineup(participant_id, formation, positions, NOW)
        self.w.lineups[participant_id] = lineup
        return lineup


class World:
    def __init__(self, app, profiles, make_token, auth_header, *, status=TournamentStatus.ACTIVE, current_round=1):
        self._profiles, self._make_token, self._auth_header = profiles, make_token, auth_header
        self.tournament = Tournament(
            uuid.uuid4(), "Copa", status, current_round, 25, 0, NOW if status is not TournamentStatus.DRAFT else None)
        self.participants: dict[uuid.UUID, Participant] = {}  # user id -> participant
        self.refs: dict[uuid.UUID, ClubRef] = {}  # participant id -> club
        self.names: dict[uuid.UUID, str] = {}
        self.all_players: dict[uuid.UUID, Player] = {}
        self.matches: dict[uuid.UUID, MatchRecord] = {}
        self.events: dict[uuid.UUID, MatchEvent] = {}
        self.lineups: dict[uuid.UUID, Lineup] = {}
        self.start_calls = self.activate_calls = 0

        self.tournaments = FakeTournaments(self)
        self.matches_repo = FakeMatches(self)
        app.dependency_overrides[get_tournament_repository] = lambda: self.tournaments
        app.dependency_overrides[get_participant_repository] = lambda: FakeParticipants(self)
        app.dependency_overrides[get_match_repository] = lambda: self.matches_repo
        app.dependency_overrides[get_player_repository] = lambda: FakePlayers(self)
        app.dependency_overrides[get_lineup_repository] = lambda: FakeLineups(self)

    def set_tournament(self, **changes) -> None:
        self.tournament = replace(self.tournament, **changes)

    def admin(self) -> Actor:
        uid = self._profiles.add(UserRole.ADMIN, "Admin")
        return Actor(uid, self._auth_header(self._make_token(uid)))

    def outsider(self) -> Actor:
        """Authenticated, but never enrolled in the tournament."""
        uid = self._profiles.add(UserRole.PARTICIPANT, "Outsider")
        return Actor(uid, self._auth_header(self._make_token(uid)))

    def participant(self, name: str) -> Actor:
        uid = self._profiles.add(UserRole.PARTICIPANT, name)
        club_id = uuid.uuid4()
        p = Participant(uuid.uuid4(), self.tournament.id, club_id, NOW)
        self.participants[uid] = p
        self.names[uid] = name
        self.refs[p.id] = ClubRef(p.id, club_id, f"Club {name}", name[:3].upper())
        players = [
            Player(uuid.uuid4(), club_id, f"{name} Player {i}", "CM", 70 + i, 25, "Land", i + 1) for i in range(12)
        ]
        self.all_players.update({pl.id: pl for pl in players})
        self.tournament = replace(self.tournament, participant_count=len(self.participants))
        return Actor(uid, self._auth_header(self._make_token(uid)), p, players)

    def add_match(self, round_, leg, home_pid, away_pid, status, **extra) -> MatchRecord:
        scored = status not in (S.SCHEDULED, S.ACTIVE)
        m = MatchRecord(
            id=uuid.uuid4(), tournament_id=self.tournament.id, round=round_, leg=leg, status=status,
            home_participant_id=home_pid, away_participant_id=away_pid,
            home_score=extra.pop("home_score", 0 if scored else None),
            away_score=extra.pop("away_score", 0 if scored else None),
            finished_at=None, confirmed_at=None, resolution_note=None, **extra,
        )
        self.matches[m.id] = m
        return m

    def add_event(self, match, actor: Actor, type_=EventType.GOAL, minute=10) -> MatchEvent:
        e = MatchEvent(uuid.uuid4(), match.id, actor.pid, actor.players[0].id, actor.players[0].name, type_, minute, NOW)
        self.events[e.id] = e
        return e


def event_body(actor: Actor, *, type_="GOAL", minute=10, player=None, participant_id=None, event_id=None) -> dict:
    return {
        "id": str(event_id or uuid.uuid4()),
        "participantId": str(participant_id or actor.pid),
        "playerId": str((player or actor.players[0]).id),
        "type": type_,
        "minute": minute,
    }
