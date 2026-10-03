"""Small helpers shared by the demo scripts. Passwords come from the environment or the git-ignored
scripts/demo/demo.env (same convention as create_users.py); they are never printed."""
import os
import sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import dotenv_values

# Player names have accents (and worse); a Windows console in cp1252 must not crash the demo over one letter.
sys.stdout.reconfigure(errors="replace")

DEMO_ENV = Path(__file__).resolve().parent / "demo.env"
DEFAULT_API_URL = "http://127.0.0.1:8000"
DOMAIN = "example.com"


def stamp() -> str:
    """Wall-clock time with milliseconds: lets you compare two terminals by eye."""
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def say(who: str, text: str) -> None:
    print(f"{stamp()} [{who}] {text}", flush=True)


def fail(message: str) -> "None":
    raise SystemExit(f"ERROR: {message}")


def password_for(variable: str) -> str:
    file_values = dotenv_values(DEMO_ENV) if DEMO_ENV.exists() else {}
    value = (os.environ.get(variable) or file_values.get(variable) or "").strip()
    if not value or "CHANGE_ME" in value:
        fail(f"{variable} is not set. Export it or fill scripts/demo/demo.env (see demo.env.example).")
    return value


def api_url(cli_value: str | None) -> str:
    return (cli_value or os.environ.get("API_URL") or DEFAULT_API_URL).rstrip("/")


def ws_url(base: str) -> str:
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/ws"


def error_code(response: httpx.Response) -> str:
    try:
        return response.json()["error"]["code"]
    except Exception:
        return f"HTTP_{response.status_code}"


def participant_email(number: int) -> str:
    return f"participant{number:02d}@{DOMAIN}"
