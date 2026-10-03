"""Concurrency test for assign_random_club: many users enrol AT THE SAME TIME.

Needs committed data (concurrent transactions cannot see each other's uncommitted rows), so it
creates fixtures prefixed 'test-assign' and removes them in a finally block.
Run: backend\\venv\\Scripts\\python.exe scripts\\db\\test_assign_club.py
"""
import sys
import threading
import uuid

import psycopg

from common import Checker, connect, load_env

ck = Checker()
ROUNDS = 10
N_USERS = 6
N_TEST_CLUBS = 4
EMAIL_DOMAIN = "test-assign.example.test"


def enrol_concurrently(dsn, tournament_id, user_ids):
    """Fire one assign_random_club call per user, all released at the same instant."""
    results = {}
    barrier = threading.Barrier(len(user_ids))

    def worker(uid):
        with connect(dsn, autocommit=True) as c:
            barrier.wait()
            try:
                row = c.execute("select club_id from public.assign_random_club(%s, %s)", (tournament_id, uid)).fetchone()
                results[uid] = ("ok", row[0])
            except psycopg.Error as exc:
                results[uid] = ("error", exc.diag.message_primary)

    threads = [threading.Thread(target=worker, args=(u,)) for u in user_ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def cleanup(conn):
    conn.execute("delete from public.tournaments where name like 'test-assign%'")
    conn.execute("delete from public.clubs where external_source_id like 'test-assign-%'")
    conn.execute(f"delete from auth.users where email like '%@{EMAIL_DOMAIN}'")


def main() -> int:
    dsn = load_env("DATABASE_URL")["DATABASE_URL"]
    with connect(dsn, autocommit=True) as admin:
        cleanup(admin)  # leftovers of a crashed previous run
        try:
            for n in range(1, N_TEST_CLUBS + 1):
                cid = uuid.uuid4()
                admin.execute(
                    "insert into public.clubs (id, name, short_name, league, country, league_rank, external_source_id)"
                    " values (%s, %s, %s, 'TestAssignLeague', 'Testland', %s, %s)",
                    (cid, f"Test Assign Club {n}", f"A{n}", n, f"test-assign-{cid}"))
            users = []
            for n in range(N_USERS):
                uid = uuid.uuid4()
                admin.execute("insert into auth.users (id, email) values (%s, %s)", (uid, f"u{n}@{EMAIL_DOMAIN}"))
                users.append(uid)
            real_clubs = admin.execute(
                "select count(*) from public.clubs where external_source_id not like 'test-assign-%'").fetchone()[0]
            free = N_TEST_CLUBS + real_clubs

            print(f"Scenario A: {N_USERS} users vs {free} clubs, {ROUNDS} rounds")
            bad_a = 0
            for r in range(ROUNDS):
                t = admin.execute("insert into public.tournaments (name) values (%s) returning id",
                                  (f"test-assign A{r}",)).fetchone()[0]
                res = enrol_concurrently(dsn, t, users)
                ok = [v[1] for v in res.values() if v[0] == "ok"]
                errs = [v[1] for v in res.values() if v[0] == "error"]
                in_db = admin.execute("select count(*), count(distinct club_id) from public.tournament_participants"
                                      " where tournament_id = %s", (t,)).fetchone()
                expected_ok = min(N_USERS, free)
                good = (len(ok) == expected_ok and len(set(ok)) == len(ok) and in_db == (expected_ok, expected_ok)
                        and all(e == "NO_FREE_CLUBS" for e in errs))
                bad_a += 0 if good else 1
            ck.check(f"no club ever assigned twice; extra users get NO_FREE_CLUBS ({ROUNDS} rounds)", bad_a == 0,
                     f"{bad_a} bad rounds")

            print(f"\nScenario B: tournament max_participants=3, {N_USERS} users at once, {ROUNDS} rounds")
            bad_b = 0
            for r in range(ROUNDS):
                t = admin.execute("insert into public.tournaments (name, max_participants) values (%s, 3) returning id",
                                  (f"test-assign B{r}",)).fetchone()[0]
                res = enrol_concurrently(dsn, t, users)
                ok = [v[1] for v in res.values() if v[0] == "ok"]
                errs = [v[1] for v in res.values() if v[0] == "error"]
                n_rows = admin.execute("select count(*) from public.tournament_participants where tournament_id = %s",
                                       (t,)).fetchone()[0]
                good = (len(ok) == 3 and len(set(ok)) == 3 and n_rows == 3
                        and len(errs) == N_USERS - 3 and all(e == "TOURNAMENT_FULL" for e in errs))
                bad_b += 0 if good else 1
            ck.check(f"capacity never exceeded under concurrency ({ROUNDS} rounds)", bad_b == 0, f"{bad_b} bad rounds")
        finally:
            cleanup(admin)
            left = admin.execute(
                "select (select count(*) from public.tournaments where name like 'test-assign%')"
                " + (select count(*) from public.clubs where external_source_id like 'test-assign-%')"
                f" + (select count(*) from auth.users where email like '%@{EMAIL_DOMAIN}')").fetchone()[0]
            ck.check("fixtures cleaned up", left == 0, f"{left} rows left")
    return ck.summary()


if __name__ == "__main__":
    sys.exit(main())
