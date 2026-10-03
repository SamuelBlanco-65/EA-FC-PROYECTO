"""Match state machine. Pure: no I/O. The ONLY place that says which status changes are legal.

    SCHEDULED --activate--> ACTIVE --finish--> PENDING_CONFIRMATION --confirm--> CONFIRMED
                                                      |  \\--reject--> DISPUTED --resolve--> RESOLVED
                                                      \\--resolve (admin, visitor never answers)--> RESOLVED

Any (status, action) pair that is not in TRANSITIONS is rejected. Services pair the transition with a
conditional UPDATE (`WHERE id = ? AND status = <source>`), so two racing requests cannot both win.
"""
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from app.domain.tournament import MatchStatus


class Action(StrEnum):
    ACTIVATE = "ACTIVATE"
    FINISH = "FINISH"
    CONFIRM = "CONFIRM"
    REJECT = "REJECT"
    RESOLVE = "RESOLVE"


class Actor(StrEnum):
    """Who may trigger the action."""

    HOME = "HOME"
    AWAY = "AWAY"
    ADMIN = "ADMIN"


@dataclass(frozen=True)
class Transition:
    source: MatchStatus
    action: Action
    target: MatchStatus
    actor: Actor


TRANSITIONS: dict[tuple[MatchStatus, Action], Transition] = {
    (t.source, t.action): t
    for t in (
        Transition(MatchStatus.SCHEDULED, Action.ACTIVATE, MatchStatus.ACTIVE, Actor.ADMIN),
        Transition(MatchStatus.ACTIVE, Action.FINISH, MatchStatus.PENDING_CONFIRMATION, Actor.HOME),
        Transition(MatchStatus.PENDING_CONFIRMATION, Action.CONFIRM, MatchStatus.CONFIRMED, Actor.AWAY),
        Transition(MatchStatus.PENDING_CONFIRMATION, Action.REJECT, MatchStatus.DISPUTED, Actor.AWAY),
        Transition(MatchStatus.DISPUTED, Action.RESOLVE, MatchStatus.RESOLVED, Actor.ADMIN),
        Transition(MatchStatus.PENDING_CONFIRMATION, Action.RESOLVE, MatchStatus.RESOLVED, Actor.ADMIN),
    )
}

# Who may trigger each action does not depend on the source status, so services can check the actor
# BEFORE the status (a visitor trying to finish gets "not allowed", whatever state the match is in).
ACTOR_BY_ACTION: dict[Action, Actor] = {t.action: t.actor for t in TRANSITIONS.values()}

# Statuses that count for the table and that close a round.
CLOSED_STATUSES = frozenset({MatchStatus.CONFIRMED, MatchStatus.RESOLVED})


class InvalidTransition(Exception):
    def __init__(self, status: MatchStatus, action: Action) -> None:
        super().__init__(f"{action} is not allowed from {status}")
        self.status = status
        self.action = action


def transition(status: MatchStatus, action: Action) -> Transition:
    try:
        return TRANSITIONS[(status, action)]
    except KeyError:
        raise InvalidTransition(status, action) from None


def round_is_closed(statuses: Iterable[MatchStatus]) -> bool:
    """True when every match of the round is CONFIRMED or RESOLVED (an empty round counts as closed)."""
    return all(s in CLOSED_STATUSES for s in statuses)
