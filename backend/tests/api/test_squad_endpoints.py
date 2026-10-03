"""/me/squad and /lineups/me. Real JWT/router/service; in-memory repositories."""
import pytest


@pytest.fixture
def two(world):
    world.me, world.rival = world.participant("Alpha"), world.participant("Bravo")
    return world


def slots(players, n=11):
    return [{"playerId": str(p.id), "x": 0.5, "y": round(i / 12, 2)} for i, p in enumerate(players[:n])]


def test_squad_is_only_my_club(client, two):
    rows = client.get("/me/squad", headers=two.me.headers).json()
    assert {r["id"] for r in rows} == {str(p.id) for p in two.me.players}
    assert rows[0]["photoUrl"] == f"/media/players/{rows[0]['id']}"
    assert set(rows[0]) == {"id", "name", "position", "overallRating", "age", "nationality", "shirtNumber", "photoUrl"}


@pytest.mark.parametrize("path", ["/me/squad", "/lineups/me"])
def test_requires_auth_and_enrolment(client, two, path):
    assert client.get(path).status_code == 401
    response = client.get(path, headers=two.outsider().headers)
    assert (response.status_code, response.json()["error"]["code"]) == (403, "NOT_A_PARTICIPANT")


def test_no_lineup_yet_is_404(client, two):
    response = client.get("/lineups/me", headers=two.me.headers)
    assert (response.status_code, response.json()["error"]["code"]) == (404, "LINEUP_NOT_FOUND")


def test_save_and_read_lineup(client, two):
    body = {"formation": "4-3-3", "positions": slots(two.me.players)}
    saved = client.put("/lineups/me", headers=two.me.headers, json=body)
    assert saved.status_code == 200
    read = client.get("/lineups/me", headers=two.me.headers).json()
    assert read["formation"] == "4-3-3" and len(read["positions"]) == 11
    assert read["participantId"] == str(two.me.pid)
    assert list(two.lineups) == [two.me.pid]  # stored under MY participant, the body cannot name another


def test_lineups_are_private(client, two):
    client.put("/lineups/me", headers=two.me.headers, json={"formation": "4-4-2", "positions": slots(two.me.players)})
    assert client.get("/lineups/me", headers=two.rival.headers).status_code == 404


def test_save_replaces_the_previous_lineup(client, two):
    client.put("/lineups/me", headers=two.me.headers, json={"formation": "4-4-2", "positions": slots(two.me.players)})
    client.put("/lineups/me", headers=two.me.headers, json={"formation": "3-5-2", "positions": slots(two.me.players, 3)})
    read = client.get("/lineups/me", headers=two.me.headers).json()
    assert read["formation"] == "3-5-2" and len(read["positions"]) == 3


def test_lineup_with_a_player_of_another_club(client, two):
    positions = slots(two.me.players, 10) + slots(two.rival.players, 1)
    response = client.put("/lineups/me", headers=two.me.headers, json={"formation": "4-4-2", "positions": positions})
    assert (response.status_code, response.json()["error"]["code"]) == (422, "PLAYER_NOT_IN_CLUB")
    assert two.lineups == {}


def test_lineup_with_repeated_player(client, two):
    positions = slots(two.me.players, 2) + slots(two.me.players, 1)
    response = client.put("/lineups/me", headers=two.me.headers, json={"formation": "4-4-2", "positions": positions})
    assert (response.status_code, response.json()["error"]["code"]) == (422, "INVALID_LINEUP")


def test_lineup_with_more_than_eleven(client, two):
    response = client.put(
        "/lineups/me", headers=two.me.headers, json={"formation": "4-4-2", "positions": slots(two.me.players, 12)})
    assert (response.status_code, response.json()["error"]["code"]) == (422, "INVALID_LINEUP")


@pytest.mark.parametrize(
    "body",
    [
        {"formation": "", "positions": []},
        {"formation": "banana", "positions": []},
        {"formation": "4-3-3"},
    ],
)
def test_lineup_validation(client, two, body):
    response = client.put("/lineups/me", headers=two.me.headers, json=body)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "VALIDATION_ERROR")


@pytest.mark.parametrize(("x", "y"), [(1.5, 0.5), (-0.1, 0.5), (0.5, 2)])
def test_lineup_coordinates_must_be_between_0_and_1(client, two, x, y):
    positions = [{"playerId": str(two.me.players[0].id), "x": x, "y": y}]
    response = client.put("/lineups/me", headers=two.me.headers, json={"formation": "4-3-3", "positions": positions})
    assert (response.status_code, response.json()["error"]["code"]) == (422, "VALIDATION_ERROR")
