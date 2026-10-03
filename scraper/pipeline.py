"""raw -> parse -> normalize -> validate -> scraper/data/normalized/<club-folder>.json + report.json

    backend\\venv\\Scripts\\python.exe -m scraper.pipeline                 # all 25 clubs
    backend\\venv\\Scripts\\python.exe -m scraper.pipeline --only arsenal  # one club (match on name/short_name)
"""
import argparse
import json
from collections import Counter

from scraper.media import process_image
from scraper.normalize import normalize_club, normalize_player
from scraper.parsers.sofifa_team import parse_team_page
from scraper.settings import NORMALIZED_DIR, REPORT_JSON, club_folder_name, load_clubs_config, slugify
from scraper.sources.base import ScrapingSource
from scraper.sources.sofifa_saved import SofifaSavedPages
from scraper.validate import validate_club, validate_player

MIN_SQUAD = 11


def process_club(source: ScrapingSource, config_club: dict, issues: list[dict]) -> dict | None:
    def issue(level: str, code: str, detail: str = "", player: str | None = None) -> None:
        issues.append({"level": level, "code": code, "club": config_club["name"], "player": player, "detail": detail})

    page = source.fetch_club(config_club)
    if page is None:
        issue("error", "PAGE_NOT_FOUND", f"expected exactly one .html in raw/sofifa/{club_folder_name(config_club)}")
        return None

    team = parse_team_page(page.html)
    for column in team.missing_columns:
        issue("error", "MISSING_COLUMN", f"'{column}' is not in the saved table: re-save the page with that column added")
    club = normalize_club(config_club, team)
    for code in validate_club(club):
        issue("error", code)
    if club["external_source_id"] is None:
        return None
    if slugify(team.page_name or "") != slugify(config_club["name"]):
        issue("warning", "CLUB_NAME_MISMATCH", f"page says '{team.page_name}', config says '{config_club['name']}'")

    club["crest_file"], crest_error = process_image(page.base_dir, team.crest_src, "crests", club["external_source_id"])
    if crest_error:
        issue("warning", f"CREST_{crest_error}")

    players: list[dict] = []
    rejected: list[dict] = []
    for parsed in team.players:
        player = normalize_player(parsed)
        if parsed.loaned_out:
            rejected.append({"external_source_id": player["external_source_id"], "name": player["name"], "reasons": ["LOANED_OUT"]})
            issue("rejected", "LOANED_OUT", player=player["name"])
            continue
        rejections, warnings = validate_player(player)
        if rejections:
            rejected.append({"external_source_id": player["external_source_id"], "name": player["name"], "reasons": rejections})
            for code in rejections:
                issue("rejected", code, player=player["name"])
            continue
        for code in warnings:
            issue("warning", code, player=player["name"])
        player["photo_file"], photo_error = process_image(page.base_dir, parsed.photo_src, "players", player["external_source_id"])
        if photo_error:
            issue("warning", f"PHOTO_{photo_error}", player=player["name"])
        players.append(player)

    if len(players) < MIN_SQUAD:
        issue("warning", "SMALL_SQUAD", f"only {len(players)} valid players")

    return {"club": club, "players": players, "rejected": rejected, "players_found": len(team.players)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="process only clubs whose name or short_name matches this text")
    args = parser.parse_args()

    clubs = load_clubs_config()
    if args.only:
        needle = slugify(args.only)
        clubs = [c for c in clubs if needle in (slugify(c["name"]), slugify(c["short_name"]))]
        if not clubs:
            raise SystemExit(f"no club matches '{args.only}'")

    source = SofifaSavedPages()
    issues: list[dict] = []
    processed = []
    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    for config_club in clubs:
        result = process_club(source, config_club, issues)
        if result is None:
            continue
        processed.append(result)
        out = NORMALIZED_DIR / f"{club_folder_name(config_club)}.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {
        "clubs_requested": len(clubs),
        "clubs_processed": len(processed),
        "crests_ok": sum(1 for r in processed if r["club"]["crest_file"]),
        "players_found": sum(r["players_found"] for r in processed),
        "players_valid": sum(len(r["players"]) for r in processed),
        "players_rejected": sum(len(r["rejected"]) for r in processed),
        "photos_ok": sum(1 for r in processed for p in r["players"] if p["photo_file"]),
        "overall_rating_null": sum(1 for r in processed for p in r["players"] if p["overall_rating"] is None),
        "issues_by_type": dict(Counter(f"{i['level']}:{i['code']}" for i in issues)),
    }
    REPORT_JSON.write_text(json.dumps({"summary": summary, "issues": issues}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    for i in issues:
        if i["level"] in ("error", "warning") and i["code"] not in ("SHIRT_NUMBER_NULL",):
            print(f"  [{i['level']}] {i['club']} {i['player'] or ''} {i['code']} {i['detail']}")


if __name__ == "__main__":
    main()
