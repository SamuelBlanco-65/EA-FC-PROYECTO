"""Loads scraper/data/normalized/*.json into Supabase. Idempotent: rows are upserted by external_source_id
and images are uploaded with upsert, so running it twice duplicates nothing.

    backend\\venv\\Scripts\\python.exe -m scraper.seed
    backend\\venv\\Scripts\\python.exe -m scraper.seed --only arsenal

The secret key is used here (backend-side tooling only) and is never printed.
"""
import argparse
import json
from collections import Counter

from supabase import create_client

from scraper.settings import MEDIA_BUCKET, NORMALIZED_DIR, NORMALIZED_MEDIA_DIR, REPORT_JSON, load_env, slugify

CLUB_COLUMNS = ["external_source_id", "name", "short_name", "league", "country", "league_rank", "primary_color", "secondary_color"]
PLAYER_COLUMNS = ["external_source_id", "name", "position", "overall_rating", "age", "nationality", "shirt_number",
                  "pace", "shooting", "passing", "dribbling", "defending", "physical"]


def upload_image(client, relative_file: str | None, errors: Counter, label: str) -> str | None:
    """Uploads one normalized PNG; returns the storage path to save in the DB, or None."""
    if not relative_file:
        return None
    data = (NORMALIZED_MEDIA_DIR / relative_file).read_bytes()
    try:
        client.storage.from_(MEDIA_BUCKET).upload(relative_file, data, {"content-type": "image/png", "upsert": "true"})
    except Exception as exc:  # storage3 raises its own error types; report the type, never the secret
        errors[f"UPLOAD_FAILED:{label}:{type(exc).__name__}"] += 1
        print(f"  [error] upload {relative_file}: {type(exc).__name__}: {exc}")
        return None
    return relative_file


def seed_club(client, data: dict, counts: Counter, errors: Counter) -> None:
    club = {key: data["club"][key] for key in CLUB_COLUMNS}
    club["crest_path"] = upload_image(client, data["club"].get("crest_file"), errors, "crest")
    counts["crests_uploaded"] += 1 if club["crest_path"] else 0

    saved = client.table("clubs").upsert(club, on_conflict="external_source_id").execute()
    club_id = saved.data[0]["id"]
    counts["clubs_upserted"] += 1

    rows = []
    for player in data["players"]:
        row = {key: player[key] for key in PLAYER_COLUMNS}
        row["club_id"] = club_id
        row["photo_path"] = upload_image(client, player.get("photo_file"), errors, "photo")
        counts["photos_uploaded"] += 1 if row["photo_path"] else 0
        rows.append(row)
    if rows:
        client.table("players").upsert(rows, on_conflict="external_source_id").execute()
    counts["players_upserted"] += len(rows)


def row_counts(client) -> dict:
    return {
        table: client.table(table).select("id", count="exact").execute().count
        for table in ("clubs", "players")
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="seed only clubs whose name or short_name matches this text")
    args = parser.parse_args()

    env = load_env("SUPABASE_URL", "SUPABASE_SECRET_KEY")
    client = create_client(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])

    files = sorted(p for p in NORMALIZED_DIR.glob("*.json") if p != REPORT_JSON)
    datasets = [json.loads(p.read_text(encoding="utf-8")) for p in files]
    if args.only:
        needle = slugify(args.only)
        datasets = [d for d in datasets if needle in (slugify(d["club"]["name"]), slugify(d["club"]["short_name"]))]
    if not datasets:
        raise SystemExit("nothing to seed: run `python -m scraper.pipeline` first")

    before = row_counts(client)
    counts: Counter = Counter()
    errors: Counter = Counter()
    for data in datasets:
        print(f"seeding {data['club']['name']} ...")
        seed_club(client, data, counts, errors)
    after = row_counts(client)

    print(json.dumps({"rows_before": before, "rows_after": after, **counts, "errors": dict(errors)}, indent=2))


if __name__ == "__main__":
    main()
