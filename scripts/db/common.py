"""Shared helpers for the DB scripts: load backend/.env and open Postgres connections."""
from pathlib import Path

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
ENV_PATH = ROOT / "backend" / ".env"

PLACEHOLDERS = ("REPLACE_ME", "YOUR-")


def load_env(*names: str) -> dict[str, str]:
    values = dotenv_values(ENV_PATH)
    result: dict[str, str] = {}
    for name in names:
        value = (values.get(name) or "").strip()
        if not value or any(p in value for p in PLACEHOLDERS):
            raise SystemExit(f"{name} is missing or still a placeholder in {ENV_PATH}")
        result[name] = value
    return result


class Checker:
    """Collects PASS/FAIL lines; exit code 1 if anything failed."""

    def __init__(self) -> None:
        self.failed: list[str] = []
        self.total = 0

    def check(self, label: str, ok: bool, detail: str = "") -> None:
        self.total += 1
        if not ok:
            self.failed.append(label)
        suffix = f"  [{detail}]" if detail else ""
        print(f"  {'PASS' if ok else 'FAIL'}  {label}{suffix}")

    def summary(self) -> int:
        print(f"\n{self.total - len(self.failed)}/{self.total} checks passed")
        for label in self.failed:
            print(f"  FAILED: {label}")
        return 1 if self.failed else 0


def connect(database_url: str, **kwargs) -> psycopg.Connection:
    # prepare_threshold=None: poolers (Supavisor) do not like server-side prepared statements.
    return psycopg.connect(database_url, prepare_threshold=None, connect_timeout=20, **kwargs)
