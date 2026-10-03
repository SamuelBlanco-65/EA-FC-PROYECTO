"""The `standings` SQL view (migration 0004) against the real database.

Decision: the table is computed by the view, NOT duplicated in Python, so there is a single source
of truth. Every test runs in a transaction that is rolled back: nothing is left behind.
Skip with: python -m pytest -m "not integration"
"""
import uuid

import psycopg
import pytest
from dotenv import dotenv_values

from app.core.config import ENV_PATH

pytestmark = pytest.mark.integration

WIN, DRAW = 3, 1


@pytest.fixture
def db():
    url = (dotenv_values(ENV_PATH).get("DATABASE_URL") or "").strip()
    if not url or "REPLACE_ME" in url or "YOUR-" in url:
        pytest.skip("backend/.env has no real DATABASE_URL")
    conn = psycopg.connect(url, prepare_threshold=None, connect_timeout=20)
    yield conn
    conn.rollback()
    conn.close()


class Table:
    """Builds one tournament with named clubs and lets a test add matches, then reads the view."""

    def __init__(self, conn, names):
        self.conn = conn
        tag = uuid.uuid4().hex[:8]
        self.tournament = conn.execute(
            "insert into public.tournaments (name) values (%s) returning id", (f"test-standings-{tag}",)
        ).fetchone()[0]
        self.participant = {}
        for rank, name in enumerate(names, start=1):
            club = uuid.uuid4()
            user = uuid.uuid4()
            conn.execute("insert into auth.users (id, email) values (%s, %s)", (user, f"{club}@standings.example.test"))
            conn.execute(
                "insert into public.clubs (id, name, short_name, league, country, league_rank, external_source_id)"
                " values (%s, %s, %s, %s, 'Testland', %s, %s)",
                (club, f"{name} {tag}", name[:3], f"League {tag}", rank, f"test-standings-{club}"),
            )
            self.participant[name] = conn.execute(
                "insert into public.tournament_participants (tournament_id, user_id, club_id)"
                " values (%s, %s, %s) returning id", (self.tournament, user, club)
            ).fetchone()[0]
        self.tag = tag
        self._round = 0
        self._admin = user  # any profile works as `resolved_by`

    def match(self, home, away, home_score, away_score, status="CONFIRMED"):
        self._round += 1
        scored = status not in ("SCHEDULED", "ACTIVE")
        self.conn.execute(
            "insert into public.matches (tournament_id, round, leg, home_participant_id, away_participant_id,"
            " status, home_score, away_score, resolved_by) values (%s, %s, 1, %s, %s, %s, %s, %s, %s)",
            (self.tournament, self._round, self.participant[home], self.participant[away], status,
             home_score if scored else None, away_score if scored else None,
             self._admin if status == "RESOLVED" else None),
        )

    def rows(self):
        """{name: (position, played, won, drawn, lost, gf, ga, gd, points)} with the tag stripped."""
        result = self.conn.execute(
            "select club_name, position, played, won, drawn, lost, goals_for, goals_against,"
            " goal_difference, points from public.standings where tournament_id = %s order by position",
            (self.tournament,),
        ).fetchall()
        return {r[0].removesuffix(f" {self.tag}"): r[1:] for r in result}

    def order(self):
        return list(self.rows())


def test_win_draw_and_loss_points(db):
    t = Table(db, ["Alpha", "Bravo", "Charlie"])
    t.match("Alpha", "Bravo", 2, 0)  # Alpha wins
    t.match("Bravo", "Charlie", 1, 1)  # draw
    rows = t.rows()
    assert rows["Alpha"] == (1, 1, 1, 0, 0, 2, 0, 2, WIN)
    assert rows["Charlie"] == (2, 1, 0, 1, 0, 1, 1, 0, DRAW)
    assert rows["Bravo"] == (3, 2, 0, 1, 1, 1, 3, -2, DRAW)  # lost one, drew one


def test_away_win_counts_for_the_visitor(db):
    t = Table(db, ["Alpha", "Bravo"])
    t.match("Alpha", "Bravo", 0, 3)
    rows = t.rows()
    assert rows["Bravo"][8] == WIN and rows["Bravo"][7] == 3
    assert rows["Alpha"][8] == 0 and rows["Alpha"][7] == -3


def test_one_row_per_participant_even_without_matches(db):
    t = Table(db, ["Alpha", "Bravo", "Charlie"])
    t.match("Alpha", "Bravo", 1, 0)
    rows = t.rows()
    assert set(rows) == {"Alpha", "Bravo", "Charlie"}
    assert rows["Charlie"][1:] == (0, 0, 0, 0, 0, 0, 0, 0)


@pytest.mark.parametrize("status", ["SCHEDULED", "ACTIVE", "PENDING_CONFIRMATION", "DISPUTED"])
def test_only_confirmed_and_resolved_matches_count(db, status):
    t = Table(db, ["Alpha", "Bravo"])
    t.match("Alpha", "Bravo", 5, 0, status=status)
    assert t.rows()["Alpha"][1] == 0  # played


@pytest.mark.parametrize("status", ["CONFIRMED", "RESOLVED"])
def test_confirmed_and_resolved_both_count(db, status):
    t = Table(db, ["Alpha", "Bravo"])
    t.match("Alpha", "Bravo", 1, 0, status=status)
    assert t.rows()["Alpha"][8] == WIN


def test_points_decide_first(db):
    t = Table(db, ["Alpha", "Bravo", "Charlie"])
    t.match("Alpha", "Charlie", 1, 0)  # Alpha 3 pts, GD +1
    t.match("Bravo", "Charlie", 5, 0)  # Bravo 3 pts, GD +5
    t.match("Bravo", "Alpha", 0, 0)  # Bravo 4 pts, Alpha 4 pts
    t.match("Charlie", "Alpha", 0, 0)  # Alpha 5 pts (GD +1) vs Bravo 4 pts (GD +5)
    assert t.order() == ["Alpha", "Bravo", "Charlie"]


def test_goal_difference_breaks_a_points_tie(db):
    t = Table(db, ["Alpha", "Bravo", "Charlie", "Delta"])
    t.match("Alpha", "Charlie", 1, 0)  # Alpha +1
    t.match("Bravo", "Delta", 4, 0)  # Bravo +4: same 3 pts, better GD
    rows = t.rows()
    assert rows["Alpha"][8] == rows["Bravo"][8] == 3
    assert t.order()[:2] == ["Bravo", "Alpha"]


def test_goals_for_breaks_a_points_and_goal_difference_tie(db):
    t = Table(db, ["Alpha", "Bravo", "Charlie", "Delta"])
    t.match("Alpha", "Charlie", 1, 0)  # 3 pts, GD +1, GF 1
    t.match("Bravo", "Delta", 4, 3)  # 3 pts, GD +1, GF 4
    rows = t.rows()
    assert rows["Alpha"][8] == rows["Bravo"][8] and rows["Alpha"][7] == rows["Bravo"][7]
    assert t.order()[:2] == ["Bravo", "Alpha"]


def test_club_name_is_the_last_tiebreak(db):
    t = Table(db, ["Zeta", "Alpha", "Mike", "Nova"])
    t.match("Zeta", "Mike", 2, 1)
    t.match("Alpha", "Nova", 2, 1)  # identical record
    assert t.order()[:2] == ["Alpha", "Zeta"]


def test_total_tie_with_no_matches_is_ordered_by_name(db):
    t = Table(db, ["Charlie", "Alpha", "Bravo"])
    assert t.order() == ["Alpha", "Bravo", "Charlie"]


def test_positions_are_consecutive_and_unique(db):
    t = Table(db, ["Alpha", "Bravo", "Charlie", "Delta"])
    t.match("Alpha", "Bravo", 1, 1)
    t.match("Charlie", "Delta", 1, 1)
    assert sorted(r[0] for r in t.rows().values()) == [1, 2, 3, 4]


def test_tournaments_do_not_mix(db):
    one = Table(db, ["Alpha", "Bravo"])
    two = Table(db, ["Alpha", "Bravo"])
    one.match("Alpha", "Bravo", 3, 0)
    assert two.rows()["Alpha"][1] == 0
    assert one.rows()["Alpha"][1] == 1
