"""Routing: who receives what. Fake sockets, real ConnectionManager / Dispatcher / translator."""
import asyncio
import json
import uuid

from app.realtime.connection_manager import ConnectionManager
from app.realtime.dispatcher import Dispatcher
from app.realtime.translator import Change

TOURNAMENT, MATCH, OTHER_MATCH = (str(uuid.uuid4()) for _ in range(3))
HOME_USER, AWAY_USER, BYSTANDER, OTHER_HOME, OTHER_AWAY = (uuid.uuid4() for _ in range(5))


class FakeSocket:
    def __init__(self, fail=False, hang=False):
        self.received: list[dict] = []
        self.fail, self.hang, self.closed_with = fail, hang, None

    async def send_text(self, text):
        if self.fail:
            raise RuntimeError("socket is closed")
        if self.hang:
            await asyncio.sleep(3600)
        self.received.append(json.loads(text))

    async def close(self, code=1000, reason=None):
        self.closed_with = code

    @property
    def types(self):
        return [m["type"] for m in self.received]


class FakeAudience:
    def __init__(self):
        self.lookups = 0
        self.fail = False
        self.table = {
            uuid.UUID(MATCH): frozenset({HOME_USER, AWAY_USER}),
            uuid.UUID(OTHER_MATCH): frozenset({OTHER_HOME, OTHER_AWAY}),
        }

    def observe(self, change):
        pass

    async def users(self, match_id):
        self.lookups += 1
        if self.fail:
            raise ConnectionError("db down")
        return self.table.get(match_id, frozenset())


def match_row(status, match=MATCH, **extra):
    return {"id": match, "tournament_id": TOURNAMENT, "round": 1, "leg": 1, "status": status,
            "home_score": 1, "away_score": 0, **extra}


def goal_row(match=MATCH):
    return {"id": str(uuid.uuid4()), "match_id": match, "participant_id": str(uuid.uuid4()),
            "player_id": str(uuid.uuid4()), "type": "GOAL", "minute": 5, "created_at": "2026-10-03T18:00:00+00:00"}


def world(**sockets):
    manager = ConnectionManager()
    users = {"home": HOME_USER, "away": AWAY_USER, "bystander": BYSTANDER, "other_home": OTHER_HOME}
    audience = FakeAudience()
    socks = {name: sockets.get(name, FakeSocket()) for name in users}
    for name, sock in socks.items():
        manager.register(users[name], sock)
    return manager, audience, Dispatcher(manager, audience), socks


def run(coro):
    return asyncio.run(coro)


def test_match_notifications_reach_only_the_two_participants():
    manager, audience, dispatcher, s = world()

    async def go():
        await dispatcher.dispatch(Change("match_events", "INSERT", goal_row()))
        await dispatcher.dispatch(Change("matches", "UPDATE", match_row("PENDING_CONFIRMATION")))
        await dispatcher.dispatch(Change("matches", "UPDATE", match_row("DISPUTED")))

    run(go())
    expected = ["MATCH_EVENT_CREATED", "MATCH_RESULT_PENDING", "MATCH_DISPUTED"]
    assert s["home"].types == expected and s["away"].types == expected
    assert s["bystander"].received == [] and s["other_home"].received == []


def test_a_match_not_involving_you_never_reaches_you():
    manager, audience, dispatcher, s = world()
    run(dispatcher.dispatch(Change("matches", "UPDATE", match_row("PENDING_CONFIRMATION", match=OTHER_MATCH))))
    assert s["home"].received == [] and s["away"].received == [] and s["bystander"].received == []


def test_global_events_reach_everyone_and_a_burst_becomes_one_event():
    manager, audience, dispatcher, s = world()

    async def go():
        for _ in range(12):  # activate_round updates a whole round in one transaction
            await dispatcher.dispatch(Change("matches", "UPDATE", match_row("ACTIVE", id=str(uuid.uuid4()))))
        for _ in range(600):  # start_tournament inserts every match
            await dispatcher.dispatch(Change("matches", "INSERT", match_row("SCHEDULED", id=str(uuid.uuid4()))))

    run(go())
    for sock in s.values():
        assert sock.types == ["ROUND_ACTIVATED", "TOURNAMENT_STARTED"]
    assert audience.lookups == 0  # global events need no lookup


def test_confirmed_match_sends_confirmation_to_participants_and_standings_to_all():
    manager, audience, dispatcher, s = world()
    run(dispatcher.dispatch(Change("matches", "UPDATE", match_row("CONFIRMED"))))
    assert s["home"].types == ["MATCH_CONFIRMED", "STANDINGS_UPDATED"]
    assert s["away"].types == ["MATCH_CONFIRMED", "STANDINGS_UPDATED"]
    assert s["bystander"].types == ["STANDINGS_UPDATED"]


def test_two_confirmed_matches_in_a_row_send_two_standings_updates():
    manager, audience, dispatcher, s = world()

    async def go():
        await dispatcher.dispatch(Change("matches", "UPDATE", match_row("CONFIRMED")))
        await dispatcher.dispatch(Change("matches", "UPDATE", match_row("RESOLVED", match=OTHER_MATCH)))

    run(go())
    assert s["bystander"].types == ["STANDINGS_UPDATED", "STANDINGS_UPDATED"]


def test_offline_participant_is_skipped_without_error():
    manager = ConnectionManager()
    only_home = FakeSocket()
    manager.register(HOME_USER, only_home)  # away user is not connected
    dispatcher = Dispatcher(manager, FakeAudience())
    run(dispatcher.dispatch(Change("matches", "UPDATE", match_row("PENDING_CONFIRMATION"))))
    assert only_home.types == ["MATCH_RESULT_PENDING"]


def test_user_with_two_devices_gets_it_on_both():
    manager = ConnectionManager()
    phone, tablet = FakeSocket(), FakeSocket()
    manager.register(HOME_USER, phone)
    manager.register(HOME_USER, tablet)
    run(Dispatcher(manager, FakeAudience()).dispatch(Change("matches", "UPDATE", match_row("DISPUTED"))))
    assert phone.types == tablet.types == ["MATCH_DISPUTED"]


def test_broken_socket_is_dropped_and_the_others_still_receive():
    broken = FakeSocket(fail=True)
    manager, audience, dispatcher, s = world(home=broken)
    run(dispatcher.dispatch(Change("matches", "UPDATE", match_row("PENDING_CONFIRMATION"))))
    assert s["away"].types == ["MATCH_RESULT_PENDING"]
    assert not manager.is_connected(HOME_USER) and broken.closed_with == 1011
    assert manager.connection_count == 3


def test_a_stuck_client_does_not_block_the_others(monkeypatch):
    monkeypatch.setattr("app.realtime.connection_manager.SEND_TIMEOUT_SECONDS", 0.2)
    stuck = FakeSocket(hang=True)
    manager, audience, dispatcher, s = world(home=stuck)

    async def go():
        started = asyncio.get_running_loop().time()
        await dispatcher.dispatch(Change("matches", "UPDATE", match_row("PENDING_CONFIRMATION")))
        return asyncio.get_running_loop().time() - started

    elapsed = run(go())
    assert s["away"].types == ["MATCH_RESULT_PENDING"]
    assert elapsed < 2 and not manager.is_connected(HOME_USER)


def test_audience_lookup_failure_does_not_stop_the_loop():
    manager, audience, dispatcher, s = world()
    audience.fail = True

    async def go():
        task = asyncio.create_task(dispatcher.run())
        dispatcher.submit(Change("matches", "UPDATE", match_row("PENDING_CONFIRMATION")))  # lookup fails
        await asyncio.sleep(0.05)
        audience.fail = False
        dispatcher.submit(Change("matches", "UPDATE", match_row("DISPUTED")))  # next one still works
        await asyncio.sleep(0.05)
        task.cancel()

    run(go())
    assert s["home"].types == ["MATCH_DISPUTED"]


def test_changes_are_delivered_in_arrival_order():
    manager, audience, dispatcher, s = world()

    async def go():
        task = asyncio.create_task(dispatcher.run())
        for status in ("PENDING_CONFIRMATION", "CONFIRMED"):
            dispatcher.submit(Change("matches", "UPDATE", match_row(status)))
        await asyncio.sleep(0.1)
        task.cancel()

    run(go())
    assert s["home"].types == ["MATCH_RESULT_PENDING", "MATCH_CONFIRMED", "STANDINGS_UPDATED"]


def test_resync_goes_to_every_connected_socket():
    manager, audience, dispatcher, s = world()
    run(dispatcher.announce_resync())
    assert all(sock.types == ["RESYNC_REQUIRED"] for sock in s.values())


def test_full_queue_drops_instead_of_blocking():
    dispatcher = Dispatcher(ConnectionManager(), FakeAudience(), queue_size=1)
    dispatcher.submit(Change("matches", "UPDATE", match_row("DISPUTED")))
    dispatcher.submit(Change("matches", "UPDATE", match_row("DISPUTED")))  # must not raise nor block
