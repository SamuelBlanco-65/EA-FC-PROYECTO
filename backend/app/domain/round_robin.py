"""Round-robin fixtures by the circle method, double round (ida y vuelta). Pure: no I/O, no randomness.

The caller decides the ORDER of the participants (e.g. shuffled once when the admin starts the
tournament); the same order always yields the same calendar.
"""
from collections.abc import Hashable, Sequence
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T", bound=Hashable)


@dataclass(frozen=True)
class Fixture(Generic[T]):
    round: int  # 1-based, across both legs
    leg: int  # 1 = ida, 2 = vuelta
    home: T
    away: T


def round_count(n: int) -> int:
    """2*(N-1) rounds for even N, 2*N for odd N (one participant rests every round)."""
    _require_enough(n)
    return 2 * (n - 1) if n % 2 == 0 else 2 * n


def match_count(n: int) -> int:
    _require_enough(n)
    return n * (n - 1)


def generate_fixtures(participants: Sequence[T]) -> list[Fixture[T]]:
    """Return every match of the double round robin, first leg rounds first, then second leg.

    Odd N: a BYE placeholder is added to make the count even; whoever is paired with it rests that
    round, and no match row is produced for it.
    """
    n = len(participants)
    _require_enough(n)
    if len(set(participants)) != n:
        raise ValueError("participants must be unique")

    slots: list[T | None] = list(participants)
    if n % 2 == 1:
        slots.append(None)  # BYE
    size = len(slots)
    rounds_per_leg = size - 1

    first_leg: list[Fixture[T]] = []
    fixed, rotating = slots[0], slots[1:]
    for r in range(rounds_per_leg):
        line = [fixed, *rotating]
        for i in range(size // 2):
            a, b = line[i], line[size - 1 - i]
            if a is None or b is None:
                continue  # BYE: this participant rests
            # The pair on board 0 would otherwise keep the same home side every round.
            home, away = (b, a) if (i == 0 and r % 2 == 1) else (a, b)
            first_leg.append(Fixture(round=r + 1, leg=1, home=home, away=away))
        rotating = [rotating[-1], *rotating[:-1]]  # circle step: last moves to the front

    second_leg = [
        Fixture(round=f.round + rounds_per_leg, leg=2, home=f.away, away=f.home) for f in first_leg
    ]
    return first_leg + second_leg


def _require_enough(n: int) -> None:
    if n < 2:
        raise ValueError("a round robin needs at least 2 participants")
