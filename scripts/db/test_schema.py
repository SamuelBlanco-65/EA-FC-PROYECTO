"""Schema tests: constraints, profile trigger, standings view, assign_random_club (sequential cases).

Everything runs inside ONE transaction that is rolled back at the end: no data is left behind.
Run: backend\\venv\\Scripts\\python.exe scripts\\db\\test_schema.py
"""
import sys
import uuid

import psycopg

from common import Checker, connect, load_env

ck = Checker()


def expect_error(conn, label, sql, params=(), sqlstate=None, constraint=None, message=None):
    """Run sql inside a savepoint; the test passes only if it raises the expected error."""
    try:
        with conn.transaction():
            conn.execute(sql, params)
    except psycopg.Error as exc:
        ok = sqlstate is None or exc.sqlstate == sqlstate
        if constraint:
            ok = ok and exc.diag.constraint_name == constraint
        if message:
            ok = ok and exc.diag.message_primary == message
        ck.check(label, ok, f"{exc.sqlstate} {exc.diag.constraint_name or exc.diag.message_primary}")
    else:
        ck.check(label, False, "no error was raised")


def new_user(conn, email, metadata="{}"):
    uid = uuid.uuid4()
    conn.execute(
        "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s::jsonb)",
        (uid, email, metadata),
    )
    return uid


def new_club(conn, n):
    cid = uuid.uuid4()
    conn.execute(
        "insert into public.clubs (id, name, short_name, league, country, league_rank, external_source_id)"
        " values (%s, %s, %s, 'TestLeague', 'Testland', %s, %s)",
        (cid, f"Test Club {n}", f"T{n}", n, f"test-schema-{cid}"),
    )
    return cid


def main() -> int:
    env = load_env("DATABASE_URL")
    with connect(env["DATABASE_URL"]) as conn:
        print("RLS coverage")
        unprotected = conn.execute(
            "select relname from pg_class where relnamespace = 'public'::regnamespace"
            " and relkind = 'r' and not relrowsecurity"
        ).fetchall()
        ck.check("RLS enabled on every table in public", not unprotected, str([r[0] for r in unprotected]))
        policies_anon = conn.execute(
            "select count(*) from pg_policies where schemaname = 'public' and 'anon' = any(roles)"
        ).fetchone()[0]
        ck.check("no policy targets anon", policies_anon == 0)

        print("\nProfile trigger")
        u1 = new_user(conn, "ana@example.test")
        u2 = new_user(conn, "beto@example.test")
        u3 = new_user(conn, "carla@example.test")
        row = conn.execute("select display_name, role from public.profiles where id = %s", (u1,)).fetchone()
        ck.check("profile auto-created with role participant", row == ("ana", "participant"), str(row))
        u_evil = new_user(conn, "evil@example.test", '{"role": "admin", "display_name": "x"}')
        row = conn.execute("select display_name, role from public.profiles where id = %s", (u_evil,)).fetchone()
        ck.check("role in user metadata does NOT escalate privileges", row == ("x", "participant"), str(row))

        print("\nClub / participant uniqueness")
        c1, c2, c3 = new_club(conn, 1), new_club(conn, 2), new_club(conn, 3)
        t1 = conn.execute("insert into public.tournaments (name) values ('T1') returning id").fetchone()[0]
        t2 = conn.execute("insert into public.tournaments (name) values ('T2') returning id").fetchone()[0]

        def add_part(t, u, c):
            return conn.execute(
                "insert into public.tournament_participants (tournament_id, user_id, club_id)"
                " values (%s, %s, %s) returning id",
                (t, u, c),
            ).fetchone()[0]

        pa = add_part(t1, u1, c1)
        pb = add_part(t1, u2, c2)
        pc = add_part(t1, u3, c3)
        p_other = add_part(t2, u1, c1)  # same club in ANOTHER tournament is allowed
        ck.check("same club allowed in a different tournament", p_other is not None)
        expect_error(conn, "two users cannot hold the same club in one tournament",
                     "insert into public.tournament_participants (tournament_id, user_id, club_id) values (%s,%s,%s)",
                     (t2, u2, c1), "23505", "tournament_participants_club_unique")
        expect_error(conn, "one user cannot enrol twice in one tournament",
                     "insert into public.tournament_participants (tournament_id, user_id, club_id) values (%s,%s,%s)",
                     (t2, u1, c2), "23505", "tournament_participants_user_unique")

        print("\nMatch constraints")
        ins_match = (
            "insert into public.matches (tournament_id, round, leg, home_participant_id, away_participant_id,"
            " status, home_score, away_score, resolved_by) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)"
        )
        expect_error(conn, "home and away must differ", ins_match,
                     (t1, 1, 1, pa, pa, "SCHEDULED", None, None, None), "23514", "matches_home_away_differ")
        expect_error(conn, "participant from another tournament is rejected (composite FK)", ins_match,
                     (t1, 1, 1, pa, p_other, "SCHEDULED", None, None, None), "23503", "matches_away_fk")
        expect_error(conn, "SCHEDULED match cannot carry a score", ins_match,
                     (t1, 1, 1, pa, pb, "SCHEDULED", 1, 0, None), "23514", "matches_score_consistency")
        expect_error(conn, "PENDING_CONFIRMATION match must carry a score", ins_match,
                     (t1, 1, 1, pa, pb, "PENDING_CONFIRMATION", None, None, None), "23514", "matches_score_consistency")
        expect_error(conn, "RESOLVED match requires resolved_by", ins_match,
                     (t1, 1, 1, pa, pb, "RESOLVED", 1, 0, None), "23514", "matches_resolved_requires_admin")
        expect_error(conn, "negative score rejected", ins_match,
                     (t1, 1, 1, pa, pb, "CONFIRMED", -1, 0, None), "23514")
        expect_error(conn, "leg must be 1 or 2", ins_match,
                     (t1, 1, 3, pa, pb, "SCHEDULED", None, None, None), "23514")

        print("\nStandings view (A 2-0 B confirmed, B 1-1 C resolved, C 0-3 A disputed, B-A active)")
        m_ab = conn.execute(ins_match + " returning id", (t1, 1, 1, pa, pb, "CONFIRMED", 2, 0, None)).fetchone()[0]
        conn.execute(ins_match, (t1, 1, 1, pb, pc, "RESOLVED", 1, 1, u1))
        conn.execute(ins_match, (t1, 2, 1, pc, pa, "DISPUTED", 0, 3, None))
        conn.execute(ins_match, (t1, 3, 1, pb, pa, "ACTIVE", None, None, None))
        expect_error(conn, "same ordered fixture cannot be created twice", ins_match,
                     (t1, 4, 2, pa, pb, "SCHEDULED", None, None, None), "23505", "matches_fixture_unique")
        rows = conn.execute(
            "select position, club_name, played, won, drawn, lost, goals_for, goals_against, goal_difference, points"
            " from public.standings where tournament_id = %s order by position", (t1,)
        ).fetchall()
        expected = [
            (1, "Test Club 1", 1, 1, 0, 0, 2, 0, 2, 3),
            (2, "Test Club 3", 1, 0, 1, 0, 1, 1, 0, 1),
            (3, "Test Club 2", 2, 0, 1, 1, 1, 3, -2, 1),
        ]
        ck.check("standings count only CONFIRMED/RESOLVED, 3/1/0, order PTS-GD-GF-name", rows == expected, str(rows))

        print("\nMatch events constraints")
        pl = uuid.uuid4()
        conn.execute(
            "insert into public.players (id, external_source_id, club_id, name, position)"
            " values (%s, %s, %s, 'Test Player', 'ST')", (pl, f"test-schema-{pl}", c1))
        ins_event = ("insert into public.match_events (id, match_id, participant_id, player_id, type, minute, created_by)"
                     " values (%s,%s,%s,%s,%s,%s,%s)")
        expect_error(conn, "minute 0 rejected", ins_event, (uuid.uuid4(), m_ab, pa, pl, "GOAL", 0, u1), "23514")
        expect_error(conn, "minute 121 rejected", ins_event, (uuid.uuid4(), m_ab, pa, pl, "GOAL", 121, u1), "23514")
        expect_error(conn, "unknown event type rejected", ins_event, (uuid.uuid4(), m_ab, pa, pl, "PENALTY", 10, u1), "22P02")
        ev = uuid.uuid4()
        conn.execute(ins_event, (ev, m_ab, pa, pl, "GOAL", 10, u1))
        n = conn.execute(
            "insert into public.match_events (id, match_id, participant_id, player_id, type, minute, created_by)"
            " values (%s,%s,%s,%s,'GOAL',10,%s) on conflict (id) do nothing returning id",
            (ev, m_ab, pa, pl, u1)).fetchall()
        ck.check("re-sending the same event id is a no-op (ON CONFLICT DO NOTHING)", n == [])

        print("\nassign_random_club (sequential cases)")
        t3 = conn.execute("insert into public.tournaments (name, max_participants) values ('T3', 2) returning id").fetchone()[0]
        r1 = conn.execute("select id, club_id from public.assign_random_club(%s, %s)", (t3, u1)).fetchone()
        r1b = conn.execute("select id, club_id from public.assign_random_club(%s, %s)", (t3, u1)).fetchone()
        ck.check("assigning twice to the same user returns the same club (idempotent)", r1 == r1b)
        r2 = conn.execute("select id, club_id from public.assign_random_club(%s, %s)", (t3, u2)).fetchone()
        ck.check("second user gets a different club", r2[1] != r1[1])
        expect_error(conn, "tournament full -> TOURNAMENT_FULL",
                     "select * from public.assign_random_club(%s, %s)", (t3, u3), "P0001", message="TOURNAMENT_FULL")
        expect_error(conn, "unknown tournament -> TOURNAMENT_NOT_FOUND",
                     "select * from public.assign_random_club(%s, %s)", (uuid.uuid4(), u1), "P0001",
                     message="TOURNAMENT_NOT_FOUND")
        expect_error(conn, "unknown user -> USER_NOT_FOUND",
                     "select * from public.assign_random_club(%s, %s)", (t2, uuid.uuid4()), "P0001",
                     message="USER_NOT_FOUND")
        conn.execute("update public.tournaments set status = 'ACTIVE' where id = %s", (t3,))
        expect_error(conn, "tournament not DRAFT -> TOURNAMENT_NOT_DRAFT",
                     "select * from public.assign_random_club(%s, %s)", (t3, u3), "P0001",
                     message="TOURNAMENT_NOT_DRAFT")
        real_clubs = conn.execute(
            "select count(*) from public.clubs where external_source_id not like 'test-schema-%'").fetchone()[0]
        if real_clubs == 0:
            t4 = conn.execute("insert into public.tournaments (name) values ('T4') returning id").fetchone()[0]
            u4 = new_user(conn, "dani@example.test")
            for u in (u1, u2, u3):
                conn.execute("select * from public.assign_random_club(%s, %s)", (t4, u))
            expect_error(conn, "all clubs taken -> NO_FREE_CLUBS",
                         "select * from public.assign_random_club(%s, %s)", (t4, u4), "P0001",
                         message="NO_FREE_CLUBS")
        else:
            print("  SKIP  NO_FREE_CLUBS case (real clubs already loaded; covered while the table was empty)")

        conn.rollback()
    return ck.summary()


if __name__ == "__main__":
    sys.exit(main())
