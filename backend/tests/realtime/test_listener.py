"""Listener supervisor with a fake Realtime client: subscription, delivery, recovery and resync."""
import asyncio
from enum import Enum

from realtime import RealtimeSubscribeStates

from app.realtime.listener import RealtimeListener


class _State(Enum):
    OPEN = 1
    CLOSED = 3


class _Ws:
    state = _State.OPEN


class FakeChannel:
    def __init__(self, client):
        self.client = client
        self.callbacks = []
        self.is_joined = False

    def on_postgres_changes(self, event, callback, table=None, schema=None, filter=None, select=None):
        self.callbacks.append((table, callback))
        return self

    async def subscribe(self, state_callback):
        if self.client.subscribe_state is RealtimeSubscribeStates.SUBSCRIBED:
            self.is_joined = True
        state_callback(self.client.subscribe_state, None)
        return self


class FakeClient:
    def __init__(self, subscribe_state=RealtimeSubscribeStates.SUBSCRIBED, connect_error=None):
        self.subscribe_state = subscribe_state
        self.connect_error = connect_error
        self.is_connected = True
        self._ws_connection = _Ws()
        self.closed = False
        self.channels: list[FakeChannel] = []

    def channel(self, name):
        ch = FakeChannel(self)
        self.channels.append(ch)
        return ch

    async def close(self):
        self.closed = True
        self.is_connected = False


def payload(table, kind, record):
    return {"data": {"table": table, "type": kind, "record": record, "schema": "public"}, "ids": [1]}


class Harness:
    def __init__(self, *clients_or_errors):
        self.plan = list(clients_or_errors)
        self.created: list[FakeClient] = []
        self.changes, self.resyncs = [], 0

    def factory(self):
        item = self.plan.pop(0) if self.plan else FakeClient()
        if isinstance(item, Exception):
            raise item
        self.created.append(item)
        return item

    async def on_resync(self):
        self.resyncs += 1

    def listener(self):
        return RealtimeListener(
            self.factory, self.changes.append, self.on_resync,
            health_interval=0.02, subscribe_timeout=0.5, initial_backoff=0.01, max_backoff=0.05,
        )


async def settle(seconds=0.3):
    await asyncio.sleep(seconds)


def run(coro):
    return asyncio.run(coro)


def test_subscribes_to_both_tables_and_forwards_changes():
    h = Harness()
    listener = h.listener()

    async def go():
        task = asyncio.create_task(listener.run())
        await settle(0.1)
        assert listener.subscribed
        channel = h.created[0].channels[0]
        assert [t for t, _ in channel.callbacks] == ["matches", "match_events"]
        channel.callbacks[0][1](payload("matches", "UPDATE", {"id": "x"}))
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    run(go())
    assert len(h.changes) == 1 and h.changes[0].table == "matches" and h.changes[0].kind == "UPDATE"
    assert h.resyncs == 0  # first connection: nothing could have been missed
    assert h.created[0].closed  # shutdown closes the client


def test_dead_websocket_is_rebuilt_and_clients_are_told_to_resync():
    h = Harness()
    listener = h.listener()

    async def go():
        task = asyncio.create_task(listener.run())
        await settle(0.1)
        h.created[0]._ws_connection.state = _State.CLOSED  # e.g. server closed it cleanly (library would not notice)
        await settle(0.3)
        assert listener.subscribed and len(h.created) == 2
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    run(go())
    assert h.created[0].closed and h.resyncs == 1


def test_channel_that_leaves_is_rebuilt():
    h = Harness()
    listener = h.listener()

    async def go():
        task = asyncio.create_task(listener.run())
        await settle(0.1)
        h.created[0].channels[0].is_joined = False
        await settle(0.3)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    run(go())
    assert len(h.created) >= 2 and h.resyncs >= 1


def test_connection_failures_are_retried_with_backoff_until_it_works():
    h = Harness(ConnectionError("no route"), error_client(), FakeClient())
    listener = h.listener()

    async def go():
        task = asyncio.create_task(listener.run())
        await settle(0.5)
        assert listener.subscribed
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    run(go())
    assert len(h.created) == 2  # the failing factory call created nothing; error client + good client
    assert h.created[0].closed  # the half-built client was cleaned up
    assert h.resyncs == 1  # it was not the first attempt: clients may have missed things


def error_client():
    return FakeClient(subscribe_state=RealtimeSubscribeStates.CHANNEL_ERROR)


def test_subscribe_that_never_answers_times_out_and_retries():
    class Silent(FakeClient):
        def channel(self, name):
            ch = super().channel(name)

            async def never(cb):
                return ch

            ch.subscribe = never
            return ch

    h = Harness(Silent(), FakeClient())
    listener = h.listener()

    async def go():
        task = asyncio.create_task(listener.run())
        await settle(1.2)
        assert listener.subscribed
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    run(go())
    assert len(h.created) == 2


def test_cancellation_stops_the_loop_and_closes_the_client():
    h = Harness()
    listener = h.listener()

    async def go():
        task = asyncio.create_task(listener.run())
        await settle(0.1)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        assert task.cancelled()

    run(go())
    assert h.created[0].closed and not listener.subscribed
