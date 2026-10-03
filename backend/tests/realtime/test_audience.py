"""MatchAudience: the answer must come from memory whenever possible (each REST lookup is a network round trip)."""
import asyncio
import uuid

from app.realtime.audience import MatchAudience
from app.realtime.translator import Change

M = uuid.uuid4()
P_HOME, P_AWAY = uuid.uuid4(), uuid.uuid4()
U_HOME, U_AWAY = uuid.uuid4(), uuid.uuid4()


class FakeRepo:
    def __init__(self, fail=False):
        self.calls = {"participant_users": 0, "match_participants": 0, "recent": 0}
        self.fail = fail
        self.enrolments = {P_HOME: U_HOME, P_AWAY: U_AWAY}
        self.matches = {M: (P_HOME, P_AWAY)}

    def participant_users(self):
        self.calls["participant_users"] += 1
        if self.fail:
            raise ConnectionError("down")
        return dict(self.enrolments)

    def match_participants(self, match_id):
        self.calls["match_participants"] += 1
        return self.matches.get(match_id)

    def recent_match_participants(self):
        self.calls["recent"] += 1
        if self.fail:
            raise ConnectionError("down")
        return dict(self.matches)


def match_change():
    return Change("matches", "UPDATE", {"id": str(M), "home_participant_id": str(P_HOME), "away_participant_id": str(P_AWAY)})


def test_cold_lookup_queries_once_and_then_answers_from_memory():
    repo = FakeRepo()
    audience = MatchAudience(repo)

    async def go():
        first = await audience.users(M)
        second = await audience.users(M)
        return first, second

    first, second = asyncio.run(go())
    assert first == second == {U_HOME, U_AWAY}
    assert repo.calls == {"participant_users": 1, "match_participants": 1, "recent": 0}


def test_warm_up_means_no_query_when_the_notification_arrives():
    repo = FakeRepo()
    audience = MatchAudience(repo)

    async def go():
        await audience.warm()
        return await audience.users(M)

    assert asyncio.run(go()) == {U_HOME, U_AWAY}
    assert repo.calls == {"participant_users": 1, "match_participants": 0, "recent": 1}


def test_observing_a_match_row_replaces_the_match_query():
    repo = FakeRepo()
    audience = MatchAudience(repo)
    audience.observe(match_change())
    audience.observe(Change("match_events", "INSERT", {"id": "ignored"}))  # other tables are ignored
    audience.observe(Change("matches", "UPDATE", {"id": "garbage"}))  # malformed rows are ignored

    assert asyncio.run(audience.users(M)) == {U_HOME, U_AWAY}
    assert repo.calls["match_participants"] == 0


def test_unknown_match_is_empty_and_not_cached():
    repo = FakeRepo()
    audience = MatchAudience(repo)
    assert asyncio.run(audience.users(uuid.uuid4())) == frozenset()

    async def late():
        stranger = uuid.uuid4()
        assert await audience.users(stranger) == frozenset()
        repo.matches[stranger] = (P_HOME, P_AWAY)  # the row becomes visible a moment later
        return await audience.users(stranger)

    assert asyncio.run(late()) == {U_HOME, U_AWAY}


def test_participant_who_enrols_after_warm_up_is_found_with_one_refresh():
    repo = FakeRepo()
    repo.enrolments = {P_HOME: U_HOME}  # P_AWAY not enrolled yet at warm-up time
    audience = MatchAudience(repo)

    async def go():
        await audience.warm()
        repo.enrolments[P_AWAY] = U_AWAY
        return await audience.users(M)

    assert asyncio.run(go()) == {U_HOME, U_AWAY}
    assert repo.calls["participant_users"] == 2


def test_failed_warm_up_is_harmless():
    repo = FakeRepo(fail=True)
    audience = MatchAudience(repo)
    asyncio.run(audience.warm())  # does not raise
    repo.fail = False
    assert asyncio.run(audience.users(M)) == {U_HOME, U_AWAY}
