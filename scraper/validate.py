"""Validation rules mirror the CHECK constraints of the database (supabase/migrations/0002_tables.sql).
A player is REJECTED only when a NOT NULL field is unusable. An invalid optional value becomes NULL
plus a warning: the value is never invented or clamped."""

RANGES = {
    "overall_rating": (1, 99),
    "age": (14, 60),
    "shirt_number": (0, 99),
    **{stat: (1, 99) for stat in ("pace", "shooting", "passing", "dribbling", "defending", "physical")},
}


def validate_player(player: dict) -> tuple[list[str], list[str]]:
    """Returns (rejection_codes, warning_codes). Mutates `player`, setting out-of-range values to None."""
    rejections: list[str] = []
    warnings: list[str] = []

    if not player["name"]:
        rejections.append("MISSING_NAME")
    if not player["position"]:
        rejections.append("MISSING_POSITION")

    for field, (low, high) in RANGES.items():
        value = player[field]
        if value is None:
            warnings.append(f"{field.upper()}_NULL")
        elif not (low <= value <= high):
            player[field] = None
            warnings.append(f"{field.upper()}_OUT_OF_RANGE")
    if not player["nationality"]:
        warnings.append("NATIONALITY_NULL")
    return rejections, warnings


def validate_club(club: dict) -> list[str]:
    errors = []
    if not club["external_source_id"]:
        errors.append("MISSING_EXTERNAL_ID")
    return errors
