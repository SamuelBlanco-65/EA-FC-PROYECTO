"""Pure parser for a saved SoFIFA team page. No I/O: takes HTML text, returns plain data."""
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Tag

TEAM_URL_RE = re.compile(r"/team/(\d+)/")
PLAYER_URL_RE = re.compile(r"/player/(\d+)/")
SHIRT_RE = re.compile(r"\((\d+)\)")
CREST_RE = re.compile(r"/meta/team/\d+/\d+\.png")

# data-col codes of the stat columns, in the order of the DB columns pace..physical
STAT_COLS = ("pac", "sho", "pas", "dri", "def", "phy")
REQUIRED_COLS = ("ae", "oa", *STAT_COLS)


@dataclass
class ParsedPlayer:
    external_id: str
    name: str
    position: str | None
    age: str | None
    overall: str | None
    nationality: str | None
    shirt_number: str | None
    stats: dict[str, str | None]  # keys = STAT_COLS
    photo_src: str | None  # path as written in the saved html (local relative file)
    loaned_out: bool


@dataclass
class ParsedTeam:
    external_id: str | None
    page_name: str | None
    crest_src: str | None
    players: list[ParsedPlayer] = field(default_factory=list)
    missing_columns: list[str] = field(default_factory=list)  # required columns absent from the squad table


def _text(cell: Tag | None) -> str | None:
    if cell is None:
        return None
    value = cell.get_text(strip=True)
    return value or None


def _number(cell: Tag | None) -> str | None:
    """Value of a numeric cell. SoFIFA appends the change since the previous version ('77' + '+1') after the
    <em> holding the value, so only the <em> text is read."""
    if cell is None:
        return None
    em = cell.find("em")
    return _text(em if em is not None else cell)


def _team_cell_index(table: Tag) -> int | None:
    """Position of the 'Team & Contract' column (it has no data-col, so it is found by its header)."""
    head = table.find("thead")
    if head is None:
        return None
    for index, th in enumerate(head.find_all("th")):
        if th.get_text(strip=True) == "Team & Contract":
            return index
    return None


def _parse_row(row: Tag, loaned_out: bool, team_index: int | None) -> ParsedPlayer | None:
    cells = row.find_all("td", recursive=False)
    if len(cells) < 2:
        return None

    link = cells[1].find("a", href=PLAYER_URL_RE)
    if link is None:
        return None
    match = PLAYER_URL_RE.search(link["href"])
    name = (link.get("data-tippy-content") or link.get_text(strip=True) or "").strip()

    nationality = None
    for flag in cells[1].select("img.flag"):
        if "secondary" not in (flag.get("class") or []):
            nationality = flag.get("title")
            break

    pos_tag = cells[1].select_one("span.pos")
    photo = cells[0].find("img")

    shirt = None
    if team_index is not None and team_index < len(cells):
        own_text = "".join(cells[team_index].find_all(string=True, recursive=False))
        shirt = SHIRT_RE.search(own_text)

    return ParsedPlayer(
        external_id=match.group(1),
        name=name,
        position=_text(pos_tag),
        age=_number(row.find("td", attrs={"data-col": "ae"})),
        overall=_number(row.find("td", attrs={"data-col": "oa"})),
        nationality=nationality,
        shirt_number=shirt.group(1) if shirt else None,
        stats={col: _number(row.find("td", attrs={"data-col": col})) for col in STAT_COLS},
        photo_src=photo.get("src") if photo else None,
        loaned_out=loaned_out,
    )


def parse_team_page(html: str) -> ParsedTeam:
    soup = BeautifulSoup(html, "lxml")

    team_id = None
    canonical = soup.find("link", rel="canonical")
    if canonical and canonical.get("href"):
        m = TEAM_URL_RE.search(canonical["href"])
        team_id = m.group(1) if m else None
    if team_id is None:
        m = re.search(r"saved from url=\([^)]*\)\s*(\S+)", html)
        m = TEAM_URL_RE.search(m.group(1)) if m else None
        team_id = m.group(1) if m else None

    h1 = soup.find("h1")
    team = ParsedTeam(external_id=team_id, page_name=_text(h1), crest_src=None)

    # The club's own crest is the only meta/team image inside the profile header, outside the tables.
    profile = soup.select_one("article div.profile")
    if profile is not None:
        for img in profile.find_all("img"):
            if img.find_parent("table") is None and CREST_RE.search(img.get("data-src", "")):
                team.crest_src = img.get("src")
                break

    # First table = current squad. Any further table = players loaned out to other clubs.
    for index, table in enumerate(soup.find_all("table")):
        body = table.find("tbody")
        if body is None:
            continue
        if index == 0:
            first_row = body.find("tr")
            if first_row is not None:
                present = {td.get("data-col") for td in first_row.find_all("td", recursive=False)}
                team.missing_columns = [col for col in REQUIRED_COLS if col not in present]
        team_index = _team_cell_index(table)
        for row in body.find_all("tr"):
            player = _parse_row(row, loaned_out=index > 0, team_index=team_index)
            if player is not None:
                team.players.append(player)
    return team
