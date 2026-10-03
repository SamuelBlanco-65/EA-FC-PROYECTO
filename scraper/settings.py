"""Paths and small shared helpers for the scraper pipeline. Run everything from the repo root:
    backend\\venv\\Scripts\\python.exe -m scraper.pipeline
"""
import json
import re
import unicodedata
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
CLUBS_CONFIG = ROOT / "config" / "tournament-clubs.json"
RAW_DIR = ROOT / "scraper" / "data" / "raw"
RAW_SOFIFA_DIR = RAW_DIR / "sofifa"
RAW_MEDIA_DIR = RAW_DIR / "media"
NORMALIZED_DIR = ROOT / "scraper" / "data" / "normalized"
NORMALIZED_MEDIA_DIR = NORMALIZED_DIR / "media"
REPORT_JSON = NORMALIZED_DIR / "report.json"
ENV_PATH = ROOT / "backend" / ".env"

MEDIA_BUCKET = "media"


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def club_folder_name(club: dict) -> str:
    """Folder the user saves each club page into, e.g. premier-league_1_arsenal."""
    return f"{slugify(club['league'])}_{club['league_rank']}_{slugify(club['name'])}"


def load_clubs_config() -> list[dict]:
    return json.loads(CLUBS_CONFIG.read_text(encoding="utf-8"))["clubs"]


def load_env(*names: str) -> dict[str, str]:
    values = dotenv_values(ENV_PATH)
    result: dict[str, str] = {}
    for name in names:
        value = (values.get(name) or "").strip()
        if not value or "REPLACE_ME" in value or "YOUR-" in value:
            raise SystemExit(f"{name} is missing or still a placeholder in {ENV_PATH}")
        result[name] = value
    return result
