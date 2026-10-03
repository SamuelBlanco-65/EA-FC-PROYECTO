import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MatchEvent, Player } from '../src/api/types';
import { clampMinute, lastMinute, liveScore, mergeEvents, sortSquad, tally } from '../src/features/match/derive';
import { EventQueue, type Failure, type QueuedEvent, type QueueStorage } from '../src/offline/eventQueue';

class MemoryStorage implements QueueStorage {
  data = new Map<string, string>();
  failWrites = false;
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('disk full');
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

/** Stand-in for POST /matches/{id}/events: stores each id once, answers 200-equivalent on a resend. */
class FakeServer {
  stored = new Map<string, QueuedEvent>();
  calls: string[] = [];
  down = false;
  rejectIds = new Set<string>();
  async send(event: QueuedEvent) {
    this.calls.push(event.id);
    if (this.down) throw new Error('network');
    if (this.rejectIds.has(event.id)) throw Object.assign(new Error('MATCH_NOT_ACTIVE'), { permanent: true });
    const already = this.stored.has(event.id);
    if (!already) this.stored.set(event.id, event);
    return { id: event.id, alreadyRecorded: already };
  }
}

const classify = (error: unknown): Failure =>
  (error as { permanent?: boolean }).permanent
    ? { kind: 'reject', code: 'MATCH_NOT_ACTIVE', message: 'El partido no está activo.' }
    : { kind: 'retry' };

const ev = (n: number, over: Partial<QueuedEvent> = {}): QueuedEvent => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  matchId: 'm1',
  participantId: 'me',
  playerId: 'p1',
  type: 'GOAL',
  minute: n,
  createdAt: `2026-10-03T12:00:${String(n).padStart(2, '0')}Z`,
  ...over,
});

function setup(storage = new MemoryStorage(), server = new FakeServer()) {
  const queue = new EventQueue({ storage, send: (e) => server.send(e), classify });
  return { storage, server, queue };
}

describe('EventQueue', () => {
  it('persists an event before enqueue resolves, and a new instance recovers it (app killed)', async () => {
    const { storage, queue } = setup();
    await queue.enqueue(ev(1));
    await queue.enqueue(ev(2));
    const reborn = new EventQueue({ storage, send: async () => ({}), classify });
    await reborn.load();
    assert.deepEqual(reborn.getSnapshot().pending.map((e) => e.minute), [1, 2]);
  });

  it('offline: nothing is lost and order is kept; on reconnect each event reaches the server once', async () => {
    const { server, queue } = setup();
    server.down = true;
    await queue.enqueue(ev(1));
    await queue.enqueue(ev(2));
    assert.equal(await queue.flush(), 'retry');
    assert.equal(queue.getSnapshot().pending.length, 2);
    assert.deepEqual(server.calls, [ev(1).id]); // stopped at the head: no reordering

    server.down = false;
    assert.equal(await queue.flush(), 'drained');
    assert.equal(queue.getSnapshot().pending.length, 0);
    assert.deepEqual([...server.stored.values()].map((e) => e.minute), [1, 2]);
    assert.equal(server.stored.size, 2);
  });

  it('crash after the server accepted but before the queue forgot: the resend creates no duplicate', async () => {
    const { storage, server, queue } = setup();
    await queue.enqueue(ev(1));
    storage.failWrites = true; // the post-send write fails, as if the app died right there
    await queue.flush();
    assert.equal(server.stored.size, 1);

    storage.failWrites = false;
    const reborn = new EventQueue({ storage, send: (e) => server.send(e), classify });
    await reborn.load();
    assert.equal(reborn.getSnapshot().pending.length, 1); // still stored: it will be resent
    await reborn.flush();
    assert.equal(server.calls.length, 2);
    assert.equal(server.stored.size, 1); // idempotent by id
    assert.equal(reborn.getSnapshot().pending.length, 0);
  });

  it('a definitive rejection does not block the events behind it, and is kept for the user to see', async () => {
    const { server, queue } = setup();
    server.rejectIds.add(ev(1).id);
    await queue.enqueue(ev(1));
    await queue.enqueue(ev(2));
    assert.equal(await queue.flush(), 'drained');
    const snap = queue.getSnapshot();
    assert.equal(snap.pending.length, 0);
    assert.deepEqual(snap.rejected.map((e) => [e.minute, e.code]), [[1, 'MATCH_NOT_ACTIVE']]);
    assert.deepEqual([...server.stored.keys()], [ev(2).id]);
    await queue.dismissRejected(ev(1).id);
    assert.equal(queue.getSnapshot().rejected.length, 0);
  });

  it('concurrent flushes share one run: every event is sent exactly once', async () => {
    const { server, queue } = setup();
    await queue.enqueue(ev(1));
    await queue.enqueue(ev(2));
    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);
    assert.deepEqual(server.calls, [ev(1).id, ev(2).id]);
  });

  it('enqueueing the same id twice keeps one copy', async () => {
    const { queue } = setup();
    await queue.enqueue(ev(1));
    await queue.enqueue(ev(1));
    assert.equal(queue.getSnapshot().pending.length, 1);
  });

  it('if storage cannot save, enqueue fails and the event is not shown as saved', async () => {
    const { storage, queue } = setup();
    storage.failWrites = true;
    await assert.rejects(queue.enqueue(ev(1)));
    assert.equal(queue.getSnapshot().pending.length, 0);
  });

  it('a corrupt stored queue is ignored instead of crashing', async () => {
    const storage = new MemoryStorage();
    storage.data.set('eafc.eventQueue', '{not json');
    const { queue } = setup(storage);
    await queue.load();
    assert.equal(queue.getSnapshot().pending.length, 0);
  });

  it('notifies listeners for each delivered event and clear() empties memory and disk', async () => {
    const { storage, queue } = setup();
    const delivered: string[] = [];
    queue.onSent((e) => delivered.push(e.id));
    await queue.enqueue(ev(1));
    await queue.flush();
    assert.deepEqual(delivered, [ev(1).id]);
    await queue.enqueue(ev(2));
    await queue.clear();
    assert.equal(queue.getSnapshot().pending.length, 0);
    assert.equal(storage.data.has('eafc.eventQueue'), false);
  });
});

const team = (participantId: string) => ({ participantId, clubId: participantId, name: participantId, shortName: participantId, crestUrl: '' });
const match = { home: team('me'), away: team('them') };
const serverEvent = (n: number, participantId: string, type: MatchEvent['type'] = 'GOAL'): MatchEvent => ({
  id: `s-${n}`, matchId: 'm1', participantId, playerId: 'p1', playerName: 'Server Name', type, minute: n,
  createdAt: `2026-10-03T12:00:${String(n).padStart(2, '0')}Z`,
});
const squad = [{ id: 'p1', name: 'H. Lindqvist', position: 'ST', shirtNumber: 9 }] as Player[];

describe('match room derivations', () => {
  it('merges server and pending events, sorted by minute desc, deduping an id the server already has', () => {
    const queued = [ev(70), ev(5, { id: 's-1' })]; // s-1 was just delivered: server copy wins
    const merged = mergeEvents([serverEvent(1, 'them'), serverEvent(30, 'me')], queued, [], 'm1', squad);
    assert.deepEqual(merged.map((e) => [e.minute, e.state]), [[70, 'pending'], [30, 'sent'], [1, 'sent']]);
    assert.equal(merged[0].playerName, 'H. Lindqvist');
  });

  it('ignores queued events of other matches', () => {
    assert.equal(mergeEvents([], [ev(3, { matchId: 'other' })], [], 'm1', squad).length, 0);
  });

  it('score counts goals of both sides including pending ones, never rejected ones', () => {
    const rejected = [{ ...ev(9), code: 'X', message: 'no' }];
    const merged = mergeEvents(
      [serverEvent(10, 'me'), serverEvent(20, 'them'), serverEvent(30, 'them', 'YELLOW')],
      [ev(40)],
      rejected,
      'm1',
      squad,
    );
    assert.deepEqual(liveScore(merged, match), { home: 2, away: 1 });
    assert.deepEqual(tally(merged, 'them'), { goals: 1, yellows: 1, reds: 0 });
  });

  it('picker starts at the last registered minute and clamps to 1..120', () => {
    assert.equal(lastMinute([]), 1);
    assert.equal(lastMinute(mergeEvents([serverEvent(63, 'me')], [], [], 'm1', squad)), 63);
    assert.equal(clampMinute(0), 1);
    assert.equal(clampMinute(999), 120);
    assert.equal(clampMinute(NaN), 1);
    assert.equal(clampMinute(45.9), 45);
  });

  it('squad is ordered goalkeeper, defenders, midfielders, forwards', () => {
    const p = (name: string, position: string, shirtNumber: number) => ({ id: name, name, position, shirtNumber }) as Player;
    const sorted = sortSquad([p('F', 'ST', 9), p('G', 'GK', 1), p('M', 'CM', 8), p('D', 'CB', 4)]);
    assert.deepEqual(sorted.map((x) => x.name), ['G', 'D', 'M', 'F']);
  });
});
