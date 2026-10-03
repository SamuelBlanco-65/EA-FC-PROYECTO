"""Create (or refresh) demo accounts: one admin + participant01..participantNN.

Uses the Supabase Auth ADMIN API with the SECRET key from backend/.env, so run it only on your own
machine. Passwords are never hard-coded or printed: they come from the environment variables
DEMO_ADMIN_PASSWORD / DEMO_PARTICIPANT_PASSWORD, or from scripts/demo/demo.env (git-ignored).

Idempotent: an existing account gets its password reset to the configured value and its role fixed.

Run (PowerShell, repo root):
    backend\\venv\\Scripts\\python.exe scripts\\demo\\create_users.py 5
"""
import argparse
import os
import sys
from pathlib import Path

from dotenv import dotenv_values
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions
from supabase_auth.errors import AuthApiError

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENV = ROOT / "backend" / ".env"
DEMO_ENV = Path(__file__).resolve().parent / "demo.env"
PLACEHOLDERS = ("REPLACE_ME", "YOUR-", "CHANGE_ME")
MIN_PASSWORD_LENGTH = 8


def fail(message: str) -> "None":
    raise SystemExit(f"ERROR: {message}")


def read_setting(name: str, *sources: dict) -> str:
    for source in sources:
        value = (source.get(name) or "").strip()
        if value:
            if any(p in value for p in PLACEHOLDERS):
                fail(f"{name} still contains a placeholder value.")
            return value
    return ""


def load_passwords() -> tuple[str, str]:
    file_values = dotenv_values(DEMO_ENV) if DEMO_ENV.exists() else {}
    # The real environment wins over the file.
    admin = read_setting("DEMO_ADMIN_PASSWORD", os.environ, file_values)
    participant = read_setting("DEMO_PARTICIPANT_PASSWORD", os.environ, file_values)
    for name, value in (("DEMO_ADMIN_PASSWORD", admin), ("DEMO_PARTICIPANT_PASSWORD", participant)):
        if not value:
            fail(
                f"{name} is not set. Export it, or copy scripts/demo/demo.env.example to "
                f"scripts/demo/demo.env and fill it in (that file is git-ignored)."
            )
        if len(value) < MIN_PASSWORD_LENGTH:
            fail(f"{name} must have at least {MIN_PASSWORD_LENGTH} characters.")
    return admin, participant


def admin_client() -> Client:
    values = dotenv_values(BACKEND_ENV)
    url = read_setting("SUPABASE_URL", values)
    secret = read_setting("SUPABASE_SECRET_KEY", values)
    if not url or not secret:
        fail(f"SUPABASE_URL and SUPABASE_SECRET_KEY must be set in {BACKEND_ENV}.")
    return create_client(url, secret, SyncClientOptions(auto_refresh_token=False, persist_session=False))


def find_user_id(client: Client, email: str) -> str | None:
    page = 1
    while True:
        users = client.auth.admin.list_users(page=page, per_page=200)
        for user in users:
            if (user.email or "").lower() == email:
                return user.id
        if len(users) < 200:
            return None
        page += 1


def upsert_user(client: Client, email: str, password: str, display_name: str) -> tuple[str, str]:
    """Returns (user_id, 'created' | 'updated')."""
    try:
        created = client.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,  # demo accounts: no confirmation e-mail round trip
                "user_metadata": {"display_name": display_name},
            }
        )
        return created.user.id, "created"
    except AuthApiError as exc:
        if exc.code not in ("email_exists", "user_already_exists"):
            raise
    user_id = find_user_id(client, email)
    if user_id is None:
        fail(f"{email} reported as existing but was not found when listing users.")
    client.auth.admin.update_user_by_id(
        user_id, {"password": password, "email_confirm": True, "user_metadata": {"display_name": display_name}}
    )
    return user_id, "updated"


def set_profile(client: Client, user_id: str, display_name: str, role: str) -> None:
    # Secret key bypasses RLS and the column grant that makes `role` immutable for normal users.
    rows = (
        client.table("profiles")
        .update({"display_name": display_name, "role": role})
        .eq("id", user_id)
        .execute()
        .data
    )
    if len(rows) != 1:
        fail(f"profile row for {user_id} not found (is the profiles trigger migration applied?).")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("count", type=int, help="how many participants to create (participant01..NN)")
    parser.add_argument("--domain", default="example.com", help="e-mail domain (default: example.com)")
    args = parser.parse_args()
    if not 1 <= args.count <= 99:
        fail("count must be between 1 and 99.")

    admin_password, participant_password = load_passwords()
    client = admin_client()

    accounts = [(f"admin@{args.domain}", admin_password, "Admin", "admin")]
    for n in range(1, args.count + 1):
        accounts.append(
            (f"participant{n:02d}@{args.domain}", participant_password, f"Participant {n:02d}", "participant")
        )

    print(f"{'email':<34} {'role':<12} result")
    for email, password, display_name, role in accounts:
        user_id, result = upsert_user(client, email, password, display_name)
        set_profile(client, user_id, display_name, role)
        print(f"{email:<34} {role:<12} {result}")
    print(f"\nDone: {len(accounts)} accounts. Passwords come from your env / scripts/demo/demo.env (not shown).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
