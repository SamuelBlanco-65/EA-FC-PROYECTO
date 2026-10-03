"""Apply supabase/migrations/*.sql in order, once each, recording them in schema_migrations.

Usage (from the repo root, with the backend venv):
    backend\\venv\\Scripts\\python.exe scripts\\db\\apply_migrations.py            # apply pending
    backend\\venv\\Scripts\\python.exe scripts\\db\\apply_migrations.py --status   # list only

Idempotent: re-running applies nothing. Each migration runs in ONE transaction together with its
schema_migrations row, so a failure leaves no half-applied file. Applied files are immutable:
if a recorded checksum no longer matches the file, the script aborts (create a new migration).
"""
import argparse
import hashlib
import sys

from common import MIGRATIONS_DIR, connect, load_env

ADVISORY_LOCK_KEY = 7_265_001  # arbitrary constant: prevents two runners at the same time

BOOTSTRAP_SQL = """
create table if not exists public.schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
"""


def checksum(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--status", action="store_true", help="only list applied/pending")
    args = parser.parse_args()

    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print(f"No migrations found in {MIGRATIONS_DIR}")
        return 1

    env = load_env("DATABASE_URL")
    with connect(env["DATABASE_URL"]) as conn:
        conn.execute("select pg_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
        conn.commit()
        try:
            conn.execute(BOOTSTRAP_SQL)
            conn.commit()

            applied = dict(conn.execute("select version, checksum from public.schema_migrations").fetchall())
            conn.commit()

            known = {f.name for f in files}
            missing = sorted(set(applied) - known)
            if missing:
                print(f"ERROR: applied migrations missing from disk: {missing}")
                return 1

            pending = []
            for f in files:
                sql = f.read_text(encoding="utf-8")
                if f.name in applied:
                    if applied[f.name] != checksum(sql):
                        print(f"ERROR: {f.name} was modified after being applied. Create a new migration instead.")
                        return 1
                    print(f"  applied  {f.name}")
                else:
                    print(f"  PENDING  {f.name}")
                    pending.append((f, sql))

            if args.status:
                return 0
            if not pending:
                print("Nothing to apply.")
                return 0

            for f, sql in pending:
                try:
                    conn.execute(sql)
                    conn.execute(
                        "insert into public.schema_migrations (version, checksum) values (%s, %s)",
                        (f.name, checksum(sql)),
                    )
                    conn.commit()
                    print(f"  -> applied {f.name}")
                except Exception as exc:  # report and stop; the failed file is rolled back
                    conn.rollback()
                    first_line = str(exc).strip().splitlines()[0]
                    print(f"ERROR applying {f.name}: {type(exc).__name__}: {first_line}")
                    return 1
            print(f"Done: {len(pending)} migration(s) applied.")
            return 0
        finally:
            conn.rollback()
            conn.execute("select pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
            conn.commit()


if __name__ == "__main__":
    sys.exit(main())
