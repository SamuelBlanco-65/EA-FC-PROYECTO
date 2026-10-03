"""Pure translation: one Postgres change -> zero or more typed notifications. No I/O, no clock.

Rules (a match only ever changes status through the state machine, so the NEW status says what happened):
- match_events INSERT                 -> MATCH_EVENT_CREATED            (both participants)
- matches INSERT                      -> TOURNAMENT_STARTED             (everyone; one per tournament)
- matches UPDATE -> ACTIVE            -> ROUND_ACTIVATED                (everyone; one per tournament+round)
- matches UPDATE -> PENDING_CONFIRMATION / DISPUTED -> MATCH_RESULT_PENDING / MATCH_DISPUTED (participants)
- matches UPDATE -> CONFIRMED / RESOLVED -> MATCH_CONFIRMED / MATCH_RESOLVED (participants) + STANDINGS_UPDATED (everyone)
- DELETE and anything else           -> nothing

`start_tournament` inserts every match and `activate_round` updates a whole round in ONE transaction, so
Realtime delivers one message per row. `dedup_key` lets the dispatcher turn that burst into a single event.
"""
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.domain.tournament import MatchStatus
from app.realtime.events import (
    MatchConfirmed,
    MatchDisputed,
    MatchEventCreated,
    MatchResolved,
    MatchResultPending,
    RoundActivated,
    StandingsUpdated,
    TournamentStarted,
    WireMessage,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Change:
    table: str
    kind: str  # INSERT | UPDATE | DELETE
    record: dict[str, Any] | None


@dataclass(frozen=True)
class Notification:
    message: WireMessage
    # None = everyone connected; otherwise the two participants of that match.
    match_id: UUID | None
    # Same key within one burst of rows (single transaction) = one notification.
    dedup_key: str | None = None


_SCORE_MESSAGES = {
    MatchStatus.PENDING_CONFIRMATION: MatchResultPending,
    MatchStatus.CONFIRMED: MatchConfirmed,
    MatchStatus.DISPUTED: MatchDisputed,
    MatchStatus.RESOLVED: MatchResolved,
}
_AFFECTS_STANDINGS = {MatchStatus.CONFIRMED, MatchStatus.RESOLVED}


def translate(change: Change) -> list[Notification]:
    if change.record is None or change.kind not in ("INSERT", "UPDATE"):
        return []
    try:
        if change.table == "match_events" and change.kind == "INSERT":
            return [_event_created(change.record)]
        if change.table == "matches":
            return _match_changed(change.kind, change.record)
    except (KeyError, ValueError, TypeError) as exc:
        # Realtime is an external boundary: a row we cannot read is logged (type only) and skipped.
        logger.warning("untranslatable %s %s change: %s", change.table, change.kind, type(exc).__name__)
    return []


def _event_created(r: dict[str, Any]) -> Notification:
    match_id = UUID(r["match_id"])
    return Notification(
        MatchEventCreated(
            match_id=match_id, event_id=UUID(r["id"]), participant_id=UUID(r["participant_id"]),
            player_id=UUID(r["player_id"]), event_type=r["type"], minute=r["minute"],
            created_at=r["created_at"],
        ),
        match_id,
    )


def _match_changed(kind: str, r: dict[str, Any]) -> list[Notification]:
    match_id = UUID(r["id"])
    tournament_id = UUID(r["tournament_id"])
    if kind == "INSERT":
        return [Notification(TournamentStarted(tournament_id=tournament_id), None, f"started:{tournament_id}")]

    status = MatchStatus(r["status"])
    if status == MatchStatus.ACTIVE:
        return [
            Notification(
                RoundActivated(tournament_id=tournament_id, round=r["round"]),
                None,
                f"round:{tournament_id}:{r['round']}",
            )
        ]
    message_type = _SCORE_MESSAGES.get(status)
    if message_type is None:
        return []
    out = [
        Notification(
            message_type(match_id=match_id, home_score=r.get("home_score"), away_score=r.get("away_score")),
            match_id,
        )
    ]
    if status in _AFFECTS_STANDINGS:
        # Never deduplicated: each confirmed match changes the table, and a client that refetched between
        # two of them would otherwise miss the second one.
        out.append(Notification(StandingsUpdated(tournament_id=tournament_id, match_id=match_id), None))
    return out
