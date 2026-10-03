import itertools
import uuid
from datetime import UTC, datetime

import pytest

from app.domain.match import EventType, MatchEvent, derive_score, is_valid_minute
from app.domain.match_state import (
    ACTOR_BY_ACTION, TRANSITIONS, Action, Actor, InvalidTransition, round_is_closed, transition,
)
from app.domain.tournament import MatchStatus as S

VALID = [
    (S.SCHEDULED, Action.ACTIVATE, S.ACTIVE, Actor.ADMIN),
    (S.ACTIVE, Action.FINISH, S.PENDING_CONFIRMATION, Actor.HOME),
    (S.PENDING_CONFIRMATION, Action.CONFIRM, S.CONFIRMED, Actor.AWAY),
    (S.PENDING_CONFIRMATION, Action.REJECT, S.DISPUTED, Actor.AWAY),
    (S.DISPUTED, Action.RESOLVE, S.RESOLVED, Actor.ADMIN),
    (S.PENDING_CONFIRMATION, Action.RESOLVE, S.RESOLVED, Actor.ADMIN),
]
VALID_PAIRS = {(source, action) for source, action, _, _ in VALID}
INVALID = [pair for pair in itertools.product(S, Action) if pair not in VALID_PAIRS]


@pytest.mark.parametrize(("source", "action", "target", "actor"), VALID)
def test_valid_transition(source, action, target, actor):
    t = transition(source, action)
    assert (t.source, t.action, t.target, t.actor) == (source, action, target, actor)


@pytest.mark.parametrize(("status", "action"), INVALID)
def test_invalid_transition_is_rejected(status, action):
    with pytest.raises(InvalidTransition) as exc:
        transition(status, action)
    assert (exc.value.status, exc.value.action) == (status, action)


def test_table_covers_exactly_the_documented_transitions():
    assert set(TRANSITIONS) == VALID_PAIRS
    assert len(INVALID) == len(S) * len(Action) - len(VALID)  # 30 - 6 = 24


@pytest.mark.parametrize("terminal", [S.CONFIRMED, S.RESOLVED])
def test_terminal_states_have_no_exit(terminal):
    assert not [a for a in Action if (terminal, a) in TRANSITIONS]


def test_every_action_has_one_single_actor():
    for action in Action:
        actors = {t.actor for t in TRANSITIONS.values() if t.action is action}
        assert actors == {ACTOR_BY_ACTION[action]}


def test_only_home_finishes_only_away_responds():
    assert transition(S.ACTIVE, Action.FINISH).actor is Actor.HOME
    assert transition(S.PENDING_CONFIRMATION, Action.CONFIRM).actor is Actor.AWAY
    assert transition(S.PENDING_CONFIRMATION, Action.REJECT).actor is Actor.AWAY


def test_disputed_cannot_be_confirmed_or_rejected_again():
    for action in (Action.CONFIRM, Action.REJECT, Action.FINISH):
        with pytest.raises(InvalidTransition):
            transition(S.DISPUTED, action)


@pytest.mark.parametrize(
    ("statuses", "closed"),
    [
        ([], True),
        ([S.CONFIRMED, S.RESOLVED], True),
        ([S.CONFIRMED, S.PENDING_CONFIRMATION], False),
        ([S.CONFIRMED, S.DISPUTED], False),
        ([S.CONFIRMED, S.ACTIVE], False),
        ([S.SCHEDULED], False),
    ],
)
def test_round_is_closed(statuses, closed):
    assert round_is_closed(statuses) is closed


HOME, AWAY = uuid.uuid4(), uuid.uuid4()


def _event(participant, type_):
    return MatchEvent(uuid.uuid4(), uuid.uuid4(), participant, uuid.uuid4(), None, type_, 10,
                      datetime(2026, 10, 3, tzinfo=UTC))


def test_score_counts_only_goals_per_team():
    events = [
        _event(HOME, EventType.GOAL), _event(HOME, EventType.GOAL), _event(AWAY, EventType.GOAL),
        _event(HOME, EventType.YELLOW), _event(AWAY, EventType.RED),
    ]
    assert derive_score(events, HOME, AWAY) == (2, 1)


def test_score_without_events_is_zero_zero():
    assert derive_score([], HOME, AWAY) == (0, 0)


def test_score_ignores_events_of_other_participants():
    assert derive_score([_event(uuid.uuid4(), EventType.GOAL)], HOME, AWAY) == (0, 0)


@pytest.mark.parametrize(("minute", "ok"), [(0, False), (1, True), (90, True), (120, True), (121, False), (-5, False)])
def test_minute_bounds(minute, ok):
    assert is_valid_minute(minute) is ok
