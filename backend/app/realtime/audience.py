"""Who is told about a match, without asking the database on the hot path.

Two facts are immutable once written: a match's two participants, and which user a participant is. So they
are cached for the life of the process and fed from three places:
1. `observe()`: every `matches` change already carries both participant ids (free, no query);
2. `warm()`: one background load at startup (participants + recent matches);
3. a lazy lookup on a miss (e.g. the first goal of a match created while the backend was down).
Why it matters: each REST lookup costs a full round trip to Supabase; doing two of them per notification
was measured at ~1.4 s from a development PC.
"""
import asyncio
import logging
from uuid import UUID

from app.realtime.translator import Change
from app.repositories.audience_repository import AudienceRepository

logger = logging.getLogger(__name__)

_MAX_CACHED_MATCHES = 5000


class MatchAudience:
    def __init__(self, repository: AudienceRepository) -> None:
        self._repository = repository
        self._match_participants: dict[UUID, tuple[UUID, UUID]] = {}
        self._participant_user: dict[UUID, UUID] = {}

    def observe(self, change: Change) -> None:
        record = change.record
        if change.table != "matches" or not record:
            return
        try:
            self._remember_match(UUID(record["id"]), (UUID(record["home_participant_id"]), UUID(record["away_participant_id"])))
        except (KeyError, ValueError):
            pass

    async def warm(self) -> None:
        try:
            users, matches = await asyncio.gather(
                asyncio.to_thread(self._repository.participant_users),
                asyncio.to_thread(self._repository.recent_match_participants),
            )
        except Exception as exc:  # warm-up is an optimisation: lazy lookups still work
            logger.warning("audience warm-up failed: %s", type(exc).__name__)
            return
        self._participant_user.update(users)
        for match_id, pair in matches.items():
            self._remember_match(match_id, pair)
        logger.info("audience warmed: %d participants, %d matches", len(self._participant_user), len(self._match_participants))

    async def users(self, match_id: UUID) -> frozenset[UUID]:
        pair = self._match_participants.get(match_id)
        if pair is None:
            pair = await asyncio.to_thread(self._repository.match_participants, match_id)  # sync supabase-py
            if pair is None:
                return frozenset()  # not cached: it could be a lookup racing the commit
            self._remember_match(match_id, pair)
        if any(pid not in self._participant_user for pid in pair):
            self._participant_user.update(await asyncio.to_thread(self._repository.participant_users))
        return frozenset(self._participant_user[pid] for pid in pair if pid in self._participant_user)

    def _remember_match(self, match_id: UUID, pair: tuple[UUID, UUID]) -> None:
        if len(self._match_participants) >= _MAX_CACHED_MATCHES:
            self._match_participants.clear()
        self._match_participants[match_id] = pair
