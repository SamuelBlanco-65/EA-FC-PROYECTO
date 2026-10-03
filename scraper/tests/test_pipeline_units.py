from scraper.normalize import normalize_player
from scraper.parsers.sofifa_team import parse_team_page
from scraper.validate import validate_player

ROW = """<tr><td><figure><img src="./f/27_60.png" id="{pid}"></figure></td>
<td><a data-tippy-content="{name}" href="https://sofifa.com/player/{pid}/x/1/">{short}</a>
<div class="nowrap"><a><img class="flag" title="Spain"></a> <a><img class="flag secondary" title="Ghana"></a>
<a><span class="pos pos0">{pos}</span></a></div></td>
<td data-col="ae">{age}</td><td data-col="oa"><em>{ovr}</em></td><td data-col="pt">90</td>
<td><span class="pos pos0">GK</span>{shirt}<div class="sub nowrap">2024 ~ 2028</div></td>
<td data-col="pac">80</td><td data-col="sho">70</td><td data-col="pas">60</td><td data-col="dri">50</td><td data-col="def">40</td><td data-col="phy">30</td></tr>"""

HTML = """<html><head><link rel="canonical" href="https://sofifa.com//team/7/club/270003/"></head><body><main><article>
<div class="profile clearfix"><img data-src="https://cdn.sofifa.net/meta/team/19/120.png" src="./f/120.png"></div>
<h1>Test Club</h1>
<table><thead><tr><th></th><th>Name</th><th>Age</th><th>Overall rating</th><th>Potential</th><th>Team &amp; Contract</th></tr></thead><tbody>{squad}</tbody></table>
<table><thead><tr><th></th><th>Name</th><th>Age</th><th>Overall rating</th><th>Potential</th><th>Team &amp; Contract</th></tr></thead><tbody>{loan}</tbody></table></article></main></body></html>"""


def build(squad_rows, loan_rows=""):
    return HTML.format(squad=squad_rows, loan=loan_rows)


def test_parses_squad_loans_crest_and_ids():
    squad = ROW.format(pid=1, name="Full Name One", short="F. One", pos="GK", age=30, ovr=88, shirt=" (1)")
    loan = ROW.format(pid=2, name="Loaned Guy", short="L. Guy", pos="LM", age=20, ovr=64, shirt="")
    team = parse_team_page(build(squad, loan))
    assert team.external_id == "7"
    assert team.page_name == "Test Club"
    assert team.crest_src == "./f/120.png"
    assert [p.loaned_out for p in team.players] == [False, True]
    first = team.players[0]
    assert (first.name, first.position, first.age, first.overall) == ("Full Name One", "GK", "30", "88")
    assert first.nationality == "Spain"  # the 'secondary' flag (Ghana) is ignored
    assert first.shirt_number == "1"
    assert first.stats == {"pac": "80", "sho": "70", "pas": "60", "dri": "50", "def": "40", "phy": "30"}
    assert team.missing_columns == []
    assert team.players[1].shirt_number is None


def test_out_of_range_optional_values_become_null_with_warning():
    row = ROW.format(pid=3, name="Odd Age", short="O. Age", pos="ST", age=99, ovr=88, shirt=" (7)")
    player = normalize_player(parse_team_page(build(row)).players[0])
    rejections, warnings = validate_player(player)
    assert rejections == []
    assert player["age"] is None
    assert "AGE_OUT_OF_RANGE" in warnings


def test_missing_position_is_rejected():
    row = ROW.format(pid=4, name="No Pos", short="N. Pos", pos="", age=25, ovr=70, shirt=" (9)")
    player = normalize_player(parse_team_page(build(row)).players[0])
    rejections, _ = validate_player(player)
    assert rejections == ["MISSING_POSITION"]


def test_reports_missing_stat_columns():
    row = ROW.format(pid=5, name="X", short="X", pos="GK", age=30, ovr=80, shirt=" (1)")
    for code in ("pac", "phy"):
        row = row.replace(f'<td data-col="{code}">', '<td data-col="zzz">')
    team = parse_team_page(build(row))
    assert team.missing_columns == ["pac", "phy"]


def test_stats_are_normalized_to_db_columns():
    row = ROW.format(pid=6, name="Y", short="Y", pos="CB", age=25, ovr=80, shirt=" (4)")
    player = normalize_player(parse_team_page(build(row)).players[0])
    assert (player["pace"], player["shooting"], player["passing"]) == (80, 70, 60)
    assert (player["dribbling"], player["defending"], player["physical"]) == (50, 40, 30)


def test_rating_change_suffix_is_ignored():
    row = ROW.format(pid=7, name="Z", short="Z", pos="GK", age=23, ovr=77, shirt=" (1)")
    row = row.replace('<em>77</em>', '<em title="77">77</em><div><span class="plus">+1</span></div>')
    team = parse_team_page(build(row))
    assert team.players[0].overall == "77"
