from collections import Counter

import pytest

from app.domain.round_robin import generate_fixtures, match_count, round_count

SIZES = [2, 3, 4, 5, 6, 25]


def teams(n):
    return [f"T{i}" for i in range(n)]


@pytest.mark.parametrize("n", SIZES)
def test_nobody_plays_themselves(n):
    assert all(f.home != f.away for f in generate_fixtures(teams(n)))


@pytest.mark.parametrize("n", SIZES)
def test_total_matches_and_rounds(n):
    fixtures = generate_fixtures(teams(n))
    expected_rounds = 2 * (n - 1) if n % 2 == 0 else 2 * n
    assert len(fixtures) == n * (n - 1) == match_count(n)
    assert {f.round for f in fixtures} == set(range(1, expected_rounds + 1))
    assert round_count(n) == expected_rounds


@pytest.mark.parametrize("n", SIZES)
def test_every_pair_meets_exactly_twice_with_home_inverted(n):
    fixtures = generate_fixtures(teams(n))
    ordered = Counter((f.home, f.away) for f in fixtures)
    # Every ordered pair (A home vs B) appears exactly once, so each unordered pair appears twice,
    # once with each side at home.
    assert set(ordered.values()) == {1}
    assert len(ordered) == n * (n - 1)
    by_pair = {}
    for f in fixtures:
        by_pair.setdefault(frozenset((f.home, f.away)), []).append(f)
    assert len(by_pair) == n * (n - 1) // 2
    for pair_fixtures in by_pair.values():
        first, second = sorted(pair_fixtures, key=lambda f: f.leg)
        assert [first.leg, second.leg] == [1, 2]
        assert (first.home, first.away) == (second.away, second.home)


@pytest.mark.parametrize("n", SIZES)
def test_nobody_plays_twice_in_a_round(n):
    by_round = {}
    for f in generate_fixtures(teams(n)):
        by_round.setdefault(f.round, []).extend([f.home, f.away])
    for round_number, players in by_round.items():
        assert len(players) == len(set(players)), f"round {round_number} repeats a participant"


@pytest.mark.parametrize("n", [3, 5, 25])
def test_odd_n_has_exactly_one_rest_per_round(n):
    everyone = set(teams(n))
    by_round = {}
    for f in generate_fixtures(teams(n)):
        by_round.setdefault(f.round, set()).update((f.home, f.away))
    assert len(by_round) == 2 * n
    for round_number, playing in by_round.items():
        assert len(everyone - playing) == 1, f"round {round_number}"
    # Fair: every participant rests in exactly 2 rounds (one per leg).
    rests = Counter(next(iter(everyone - playing)) for playing in by_round.values())
    assert set(rests.values()) == {2} and len(rests) == n


@pytest.mark.parametrize("n", [2, 4, 6])
def test_even_n_everyone_plays_every_round(n):
    by_round = {}
    for f in generate_fixtures(teams(n)):
        by_round.setdefault(f.round, set()).update((f.home, f.away))
    assert all(len(playing) == n for playing in by_round.values())


@pytest.mark.parametrize("n", SIZES)
def test_second_leg_is_after_first_leg(n):
    fixtures = generate_fixtures(teams(n))
    last_first_leg = max(f.round for f in fixtures if f.leg == 1)
    assert all(f.round > last_first_leg for f in fixtures if f.leg == 2)


@pytest.mark.parametrize("n", SIZES)
def test_everyone_plays_the_same_number_of_matches_home_and_away(n):
    fixtures = generate_fixtures(teams(n))
    home = Counter(f.home for f in fixtures)
    away = Counter(f.away for f in fixtures)
    assert set(home.values()) == {n - 1} and set(away.values()) == {n - 1}


def test_deterministic_for_the_same_order():
    assert generate_fixtures(teams(6)) == generate_fixtures(teams(6))


def test_four_team_example_from_the_docs():
    fixtures = generate_fixtures(["A", "B", "C", "D"])
    assert [(f.round, f.leg, f.home, f.away) for f in fixtures] == [
        (1, 1, "A", "D"), (1, 1, "B", "C"),
        (2, 1, "C", "A"), (2, 1, "D", "B"),
        (3, 1, "A", "B"), (3, 1, "C", "D"),
        (4, 2, "D", "A"), (4, 2, "C", "B"),
        (5, 2, "A", "C"), (5, 2, "B", "D"),
        (6, 2, "B", "A"), (6, 2, "D", "C"),
    ]


def test_two_participants():
    assert [(f.round, f.leg, f.home, f.away) for f in generate_fixtures(["A", "B"])] == [
        (1, 1, "A", "B"),
        (2, 2, "B", "A"),
    ]


@pytest.mark.parametrize("n", [0, 1])
def test_needs_at_least_two(n):
    with pytest.raises(ValueError):
        generate_fixtures(teams(n))
    with pytest.raises(ValueError):
        round_count(n)


def test_duplicates_rejected():
    with pytest.raises(ValueError):
        generate_fixtures(["A", "A", "B"])
