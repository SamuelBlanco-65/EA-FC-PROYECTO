"""Turns parsed pages into the shape of the `clubs` / `players` tables. Pure functions, no I/O."""
from scraper.parsers.sofifa_team import ParsedPlayer, ParsedTeam

SOURCE = "sofifa"

# parser data-col code -> players column. For goalkeepers the source reuses these six slots with other
# meanings (diving, handling, kicking, reflexes, speed, positioning); see migration 0009.
STAT_COLUMNS = {"pac": "pace", "sho": "shooting", "pas": "passing", "dri": "dribbling", "def": "defending", "phy": "physical"}


def to_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value.strip())
    except ValueError:
        return None


def club_external_id(team: ParsedTeam) -> str | None:
    return f"{SOURCE}-team-{team.external_id}" if team.external_id else None


def normalize_club(config_club: dict, team: ParsedTeam) -> dict:
    # Name, short name, league and rank come from config/tournament-clubs.json (the project's decision);
    # the page only contributes the external id. Colors are not provided by the source -> NULL.
    return {
        "external_source_id": club_external_id(team),
        "name": config_club["name"],
        "short_name": config_club["short_name"],
        "league": config_club["league"],
        "country": config_club["country"],
        "league_rank": config_club["league_rank"],
        "primary_color": None,
        "secondary_color": None,
    }


def normalize_player(player: ParsedPlayer) -> dict:
    return {
        "external_source_id": f"{SOURCE}-player-{player.external_id}",
        "name": " ".join(player.name.split()),
        "position": (player.position or "").strip().upper() or None,
        "overall_rating": to_int(player.overall),
        "age": to_int(player.age),
        "nationality": player.nationality,
        "shirt_number": to_int(player.shirt_number),
        **{column: to_int(player.stats.get(code)) for code, column in STAT_COLUMNS.items()},
    }
