"""RLS test with REAL user JWTs, going through the same HTTP path the app's backend uses (PostgREST).

Flow: the secret key creates two ordinary users (+ a third as a bystander); each logs in with the
publishable key and receives a real access token (JWT). With that token we try forbidden actions
(all must fail) and allowed actions (all must work). Final state is verified with a direct DB
connection, so "no error" is never mistaken for "no effect".

Fixtures are created with a unique tag and removed in a finally block.
Run: backend\\venv\\Scripts\\python.exe scripts\\db\\test_rls.py
"""
import secrets
import sys
import uuid

import jwt  # PyJWT, only to LOOK at the token claims (no signature check needed for that)
from postgrest.exceptions import APIError
from supabase import create_client

from common import Checker, connect, load_env

ck = Checker()
DENIED = ("42501",)  # insufficient_privilege: covers both missing GRANT and RLS violations


def denied(label, fn, codes=DENIED):
    try:
        fn()
    except APIError as exc:
        ck.check(label, exc.code in codes, f"code={exc.code}")
    else:
        ck.check(label, False, "no error was raised")


def main() -> int:
    env = load_env("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "DATABASE_URL")
    url, pub, sec = env["SUPABASE_URL"], env["SUPABASE_PUBLISHABLE_KEY"], env["SUPABASE_SECRET_KEY"]
    tag = uuid.uuid4().hex[:8]
    password = secrets.token_urlsafe(18)
    admin = create_client(url, sec)
    user_ids: list[str] = []

    with connect(env["DATABASE_URL"], autocommit=True) as db:
        try:
            # ---------- fixtures ----------
            def make_user(name):
                resp = admin.auth.admin.create_user({
                    "email": f"rls-test-{name}-{tag}@example.com", "password": password,
                    "email_confirm": True, "user_metadata": {"display_name": f"Test {name.upper()}"}})
                user_ids.append(resp.user.id)
                return resp.user.id, f"rls-test-{name}-{tag}@example.com"

            (id_a, mail_a), (id_b, mail_b), (id_c, _) = make_user("a"), make_user("b"), make_user("c")

            def club(n):
                return db.execute(
                    "insert into public.clubs (name, short_name, league, country, league_rank, external_source_id)"
                    " values (%s,%s,%s,'Testland',%s,%s) returning id",
                    (f"Test RLS Club {tag} {n}", f"R{n}", f"TestRls-{tag}", n, f"test-rls-{tag}-c{n}")).fetchone()[0]

            def player(cid, n):
                return db.execute(
                    "insert into public.players (external_source_id, club_id, name, position)"
                    " values (%s,%s,%s,'ST') returning id", (f"test-rls-{tag}-p{n}", cid, f"Player {n}")).fetchone()[0]

            def participant(t, uid, cid):
                return db.execute(
                    "insert into public.tournament_participants (tournament_id, user_id, club_id)"
                    " values (%s,%s,%s) returning id", (t, uid, cid)).fetchone()[0]

            def match(t, rnd, home, away, status):
                return db.execute(
                    "insert into public.matches (tournament_id, round, leg, home_participant_id, away_participant_id, status)"
                    " values (%s,%s,1,%s,%s,%s) returning id", (t, rnd, home, away, status)).fetchone()[0]

            c_a, c_b, c_c = club(1), club(2), club(3)
            p_a, p_b = player(c_a, 1), player(c_b, 2)
            t_act = db.execute("insert into public.tournaments (name, status, current_round)"
                               " values (%s,'ACTIVE',1) returning id", (f"test-rls-{tag}",)).fetchone()[0]
            t_draft = db.execute("insert into public.tournaments (name) values (%s) returning id",
                                 (f"test-rls-{tag}-draft",)).fetchone()[0]
            part_a, part_b, part_c = participant(t_act, id_a, c_a), participant(t_act, id_b, c_b), participant(t_act, id_c, c_c)
            m_active = match(t_act, 1, part_a, part_b, "ACTIVE")
            m_sched = match(t_act, 2, part_b, part_a, "SCHEDULED")
            m_other = match(t_act, 3, part_c, part_b, "ACTIVE")  # A does not play here
            db.execute("insert into public.lineups (participant_id, formation) values (%s, '4-4-2')", (part_b,))
            # psycopg returns UUID objects; the HTTP client needs plain strings.
            c_a, c_b, c_c, p_a, p_b, t_act, t_draft = map(str, (c_a, c_b, c_c, p_a, p_b, t_act, t_draft))
            part_a, part_b, part_c, m_active, m_sched, m_other = map(
                str, (part_a, part_b, part_c, m_active, m_sched, m_other))

            # ---------- real sessions ----------
            def login(mail):
                client = create_client(url, pub)
                session = client.auth.sign_in_with_password({"email": mail, "password": password}).session
                return client, session.access_token

            ca, token_a = login(mail_a)
            cb, _ = login(mail_b)
            anon = create_client(url, pub)

            print("Identity of the token used")
            claims = jwt.decode(token_a, options={"verify_signature": False})
            ck.check("user A's JWT has role=authenticated and sub=A (a normal user, not the secret key)",
                     claims.get("role") == "authenticated" and claims.get("sub") == id_a, f"role={claims.get('role')}")

            # ---------- FORBIDDEN as user A ----------
            print("\nForbidden for user A (all must fail or have no effect)")
            r = ca.table("profiles").select("id").execute().data
            ck.check("A listing profiles sees ONLY its own row", [x["id"] for x in r] == [id_a], f"{len(r)} row(s)")
            r = ca.table("profiles").select("*").eq("id", id_b).execute().data
            ck.check("A cannot read B's profile", r == [])

            denied("A cannot change its own role to admin",
                   lambda: ca.table("profiles").update({"role": "admin"}).eq("id", id_a).execute())
            role = db.execute("select role from public.profiles where id = %s", (id_a,)).fetchone()[0]
            ck.check("  ...and A's role in the DB is still participant", role == "participant", role)

            r = ca.table("profiles").update({"display_name": "HACKED"}).eq("id", id_b).execute().data
            name_b = db.execute("select display_name from public.profiles where id = %s", (id_b,)).fetchone()[0]
            ck.check("A cannot edit B's profile (0 rows affected, name unchanged)", r == [] and name_b == "Test B", name_b)
            denied("A cannot insert a profile row",
                   lambda: ca.table("profiles").insert({"id": str(uuid.uuid4()), "display_name": "x", "role": "admin"}).execute())

            def event(match_id, participant_id, player_id, created_by=id_a, minute=10, eid=None):
                return {"id": eid or str(uuid.uuid4()), "match_id": match_id, "participant_id": participant_id,
                        "player_id": player_id, "type": "GOAL", "minute": minute, "created_by": created_by}

            denied("A cannot insert an event for B's participant",
                   lambda: ca.table("match_events").insert(event(m_active, part_b, p_b)).execute())
            denied("A cannot score with a player of another club",
                   lambda: ca.table("match_events").insert(event(m_active, part_a, p_b)).execute())
            denied("A cannot insert an event in a match that is not ACTIVE",
                   lambda: ca.table("match_events").insert(event(m_sched, part_a, p_a)).execute())
            denied("A cannot insert an event in a match where A does not play",
                   lambda: ca.table("match_events").insert(event(m_other, part_a, p_a)).execute())
            denied("A cannot forge created_by (claim B authored it)",
                   lambda: ca.table("match_events").insert(event(m_active, part_a, p_a, created_by=id_b)).execute())
            n_ev = db.execute("select count(*) from public.match_events where match_id in (%s,%s,%s)",
                              (m_active, m_sched, m_other)).fetchone()[0]
            ck.check("  ...and no forbidden event reached the DB", n_ev == 0, f"{n_ev} rows")

            denied("A cannot write clubs", lambda: ca.table("clubs").insert(
                {"name": "x", "short_name": "x", "league": "x", "country": "x", "league_rank": 1,
                 "external_source_id": f"test-rls-{tag}-x"}).execute())
            denied("A cannot create tournaments", lambda: ca.table("tournaments").insert({"name": "x"}).execute())
            denied("A cannot enrol itself directly (only the backend assigns clubs)",
                   lambda: ca.table("tournament_participants").insert(
                       {"tournament_id": t_draft, "user_id": id_a, "club_id": c_a}).execute())
            denied("A cannot insert matches", lambda: ca.table("matches").insert(
                {"tournament_id": t_act, "round": 9, "leg": 1, "home_participant_id": part_a,
                 "away_participant_id": part_b}).execute())
            denied("A cannot change a match status",
                   lambda: ca.table("matches").update({"status": "CONFIRMED"}).eq("id", m_active).execute())
            denied("A cannot call assign_random_club (secret key only)",
                   lambda: ca.rpc("assign_random_club", {"p_tournament": t_draft, "p_user": id_a}).execute(),
                   codes=DENIED + ("PGRST202",))
            denied("A cannot read schema_migrations", lambda: ca.table("schema_migrations").select("*").execute(),
                   codes=DENIED + ("PGRST205",))

            r = ca.table("lineups").select("*").eq("participant_id", part_b).execute().data
            ck.check("A cannot read B's lineup", r == [])
            denied("A cannot create a lineup for B's participant",
                   lambda: ca.table("lineups").insert({"participant_id": part_c, "formation": "3-5-2"}).execute())
            r = ca.table("lineups").update({"formation": "HACK"}).eq("participant_id", part_b).execute().data
            form = db.execute("select formation from public.lineups where participant_id = %s", (part_b,)).fetchone()[0]
            ck.check("A cannot edit B's lineup (0 rows, unchanged)", r == [] and form == "4-4-2", form)

            # ---------- FORBIDDEN as anon ----------
            print("\nForbidden for anon (publishable key, no login)")
            for table in ("clubs", "profiles", "matches", "match_events", "standings"):
                denied(f"anon cannot read {table}", lambda t=table: anon.table(t).select("*").limit(1).execute())
            denied("anon cannot insert match_events",
                   lambda: anon.table("match_events").insert(event(m_active, part_a, p_a)).execute())
            denied("anon cannot call assign_random_club",
                   lambda: anon.rpc("assign_random_club", {"p_tournament": t_draft, "p_user": id_a}).execute(),
                   codes=DENIED + ("PGRST202",))

            # ---------- ALLOWED as user A ----------
            print("\nAllowed for user A (all must work)")
            r = ca.table("profiles").select("*").eq("id", id_a).execute().data
            ck.check("A reads its own profile (role=participant, name from sign-up)",
                     len(r) == 1 and r[0]["role"] == "participant" and r[0]["display_name"] == "Test A", str(r))
            ca.table("profiles").update({"display_name": "Test A2"}).eq("id", id_a).execute()
            name_a = db.execute("select display_name from public.profiles where id = %s", (id_a,)).fetchone()[0]
            ck.check("A edits its own display_name", name_a == "Test A2", name_a)

            expectations = {"clubs": 3, "players": 2, "tournaments": 2, "tournament_participants": 3, "matches": 3}
            for table, minimum in expectations.items():
                n = len(ca.table(table).select("*").execute().data)
                ck.check(f"A reads {table}", n >= minimum, f"{n} rows")
            st = ca.table("standings").select("*").eq("tournament_id", t_act).order("position").execute().data
            ck.check("A reads standings (3 participants, position 1..3)",
                     [x["position"] for x in st] == [1, 2, 3], str([x["club_name"] for x in st]))

            ev_id = str(uuid.uuid4())
            ca.table("match_events").insert(event(m_active, part_a, p_a, eid=ev_id)).execute()
            ck.check("A inserts a valid event (own team, ACTIVE match, own player)",
                     db.execute("select count(*) from public.match_events where id = %s", (ev_id,)).fetchone()[0] == 1)
            ca.table("match_events").upsert(event(m_active, part_a, p_a, eid=ev_id), ignore_duplicates=True).execute()
            ck.check("re-sending the same event id is idempotent (no error, still 1 row)",
                     db.execute("select count(*) from public.match_events where id = %s", (ev_id,)).fetchone()[0] == 1)
            seen_by_b = cb.table("match_events").select("id").eq("id", ev_id).execute().data
            ck.check("B can read A's event (events are public to signed-in users)", len(seen_by_b) == 1)
            denied("A cannot update its own event (events are immutable)",
                   lambda: ca.table("match_events").update({"minute": 99}).eq("id", ev_id).execute())
            denied("A cannot delete its own event",
                   lambda: ca.table("match_events").delete().eq("id", ev_id).execute())

            ca.table("lineups").upsert({"participant_id": part_a, "formation": "4-3-3",
                                        "positions": [{"playerId": str(p_a), "x": 0.5, "y": 0.5}]}).execute()
            mine = ca.table("lineups").select("*").eq("participant_id", part_a).execute().data
            ck.check("A creates and reads its own lineup", len(mine) == 1 and mine[0]["formation"] == "4-3-3")
            ck.check("B cannot see A's lineup",
                     cb.table("lineups").select("*").eq("participant_id", part_a).execute().data == [])

            # ---------- secret key (backend) does what users cannot ----------
            print("\nSecret key (backend only)")
            admin.table("matches").update({"status": "ACTIVE"}).eq("id", m_sched).execute()
            st_m = db.execute("select status from public.matches where id = %s", (m_sched,)).fetchone()[0]
            ck.check("secret key can change match state (users cannot)", st_m == "ACTIVE", st_m)
            res = admin.rpc("assign_random_club", {"p_tournament": t_draft, "p_user": id_a}).execute().data
            ck.check("secret key can call assign_random_club", bool(res) and res.get("user_id") == id_a, str(res)[:80])
        finally:
            db.execute("delete from public.match_events where created_by = any(%s::uuid[])", (user_ids,))
            db.execute("delete from public.tournaments where name like %s", (f"test-rls-{tag}%",))
            db.execute("delete from public.clubs where external_source_id like %s", (f"test-rls-{tag}-%",))
            for uid in user_ids:
                try:
                    admin.auth.admin.delete_user(uid)
                except Exception as exc:  # report, do not hide
                    print(f"  WARNING could not delete test user {uid}: {exc}")
            left = db.execute(
                "select (select count(*) from public.tournaments where name like %s)"
                " + (select count(*) from public.clubs where external_source_id like %s)"
                " + (select count(*) from public.profiles where id = any(%s::uuid[]))",
                (f"test-rls-{tag}%", f"test-rls-{tag}-%", user_ids)).fetchone()[0]
            ck.check("fixtures and test users cleaned up", left == 0, f"{left} rows left")
    return ck.summary()


if __name__ == "__main__":
    sys.exit(main())
