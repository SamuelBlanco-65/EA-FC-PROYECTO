"""Pure translation of Postgres changes into typed notifications (no network, no sockets)."""
import uuid

import pytest

from app.realtime.events import DOMAIN_EVENT_TYPES, server_message_adapter
from app.realtime.translator import Change, translate

TOURNAMENT, MATCH = str(uuid.uuid4()), str(uuid.uuid4())


def match_row(status, **extra):
    row = {
        "id": MATCH, "tournament_id": TOURNAMENT, "round": 3, "leg": 1, "status": status,
        "home_participant_id": str(uuid.uuid4()), "away_participant_id": str(uuid.uuid4()),
        "home_score": None, "away_score": None,
    }
    return {**row, **extra}


def one(change):
    [n] = translate(change)
    return n


def test_event_insert_goes_to_both_participants_of_the_match():
    row = {
        "id": str(uuid.uuid4()), "match_id": MATCH, "participant_id": str(uuid.uuid4()),
        "player_id": str(uuid.uuid4()), "type": "GOAL", "minute": 37, "created_by": str(uuid.uuid4()),
        "created_at": "2026-10-03T18:00:00.123456+00:00",
    }
    n = one(Change("match_events", "INSERT", row))
    assert n.message.type == "MATCH_EVENT_CREATED"
    assert n.match_id == uuid.UUID(MATCH) and n.dedup_key is None
    wire = n.message.model_dump(mode="json", by_alias=True)
    assert wire["eventType"] == "GOAL" and wire["minute"] == 37 and wire["matchId"] == MATCH
    assert "createdBy" not in wire  # internal column never leaves the backend


@pytest.mark.parametrize(
    "status,expected",
    [
        ("PENDING_CONFIRMATION", "MATCH_RESULT_PENDING"),
        ("DISPUTED", "MATCH_DISPUTED"),
    ],
)
def test_status_changes_notify_only_the_two_participants(status, expected):
    n = one(Change("matches", "UPDATE", match_row(status, home_score=2, away_score=1)))
    assert n.message.type == expected
    assert n.match_id == uuid.UUID(MATCH)
    assert (n.message.home_score, n.message.away_score) == (2, 1)


@pytest.mark.parametrize("status,expected", [("CONFIRMED", "MATCH_CONFIRMED"), ("RESOLVED", "MATCH_RESOLVED")])
def test_closing_a_match_also_updates_the_table_for_everyone(status, expected):
    first, second = translate(Change("matches", "UPDATE", match_row(status, home_score=0, away_score=0)))
    assert first.message.type == expected and first.match_id == uuid.UUID(MATCH)
    assert second.message.type == "STANDINGS_UPDATED" and second.match_id is None
    # Not deduplicated: two matches confirmed in a row are two table changes.
    assert second.dedup_key is None


def test_activating_a_round_is_global_and_deduplicated_per_round():
    a = one(Change("matches", "UPDATE", match_row("ACTIVE")))
    b = one(Change("matches", "UPDATE", match_row("ACTIVE", id=str(uuid.uuid4()))))
    assert a.message.type == "ROUND_ACTIVATED" and a.match_id is None
    assert (a.message.round, str(a.message.tournament_id)) == (3, TOURNAMENT)
    assert a.dedup_key == b.dedup_key  # 12 rows, one transaction -> one notification
    other_round = one(Change("matches", "UPDATE", match_row("ACTIVE", round=4)))
    assert other_round.dedup_key != a.dedup_key


def test_inserting_matches_means_the_tournament_started_once():
    a = one(Change("matches", "INSERT", match_row("SCHEDULED")))
    b = one(Change("matches", "INSERT", match_row("SCHEDULED", id=str(uuid.uuid4()))))
    assert a.message.type == "TOURNAMENT_STARTED" and a.match_id is None
    assert a.dedup_key == b.dedup_key


@pytest.mark.parametrize(
    "change",
    [
        Change("matches", "DELETE", None),
        Change("match_events", "DELETE", {"id": MATCH}),
        Change("matches", "UPDATE", match_row("SCHEDULED")),
        Change("match_events", "UPDATE", {"id": MATCH}),
        Change("lineups", "INSERT", {"id": MATCH}),
        Change("matches", "UPDATE", None),
    ],
)
def test_irrelevant_changes_produce_nothing(change):
    assert translate(change) == []


@pytest.mark.parametrize(
    "change",
    [
        Change("matches", "UPDATE", {"id": MATCH}),  # columns missing
        Change("matches", "UPDATE", match_row("NOT_A_STATUS")),
        Change("match_events", "INSERT", {"id": "not-a-uuid", "match_id": MATCH}),
        Change("match_events", "INSERT", {
            "id": str(uuid.uuid4()), "match_id": MATCH, "participant_id": str(uuid.uuid4()),
            "player_id": str(uuid.uuid4()), "type": "OWN_GOAL", "minute": 3, "created_at": "2026-10-03T18:00:00+00:00",
        }),
    ],
)
def test_malformed_rows_are_skipped_not_raised(change):
    assert translate(change) == []


def test_every_required_event_type_is_producible_and_valid_on_the_wire():
    produced = set()
    rows = [
        Change("match_events", "INSERT", {
            "id": str(uuid.uuid4()), "match_id": MATCH, "participant_id": str(uuid.uuid4()),
            "player_id": str(uuid.uuid4()), "type": "RED", "minute": 90, "created_at": "2026-10-03T18:00:00+00:00",
        }),
        Change("matches", "INSERT", match_row("SCHEDULED")),
        *[Change("matches", "UPDATE", match_row(s, home_score=1, away_score=0)) for s in
          ("ACTIVE", "PENDING_CONFIRMATION", "CONFIRMED", "DISPUTED", "RESOLVED")],
    ]
    for change in rows:
        for n in translate(change):
            produced.add(n.message.type)
            # Round trip through the discriminated union the mobile app mirrors
            wire = n.message.model_dump_json(by_alias=True)
            assert server_message_adapter.validate_json(wire).type == n.message.type
    assert produced == set(DOMAIN_EVENT_TYPES)
