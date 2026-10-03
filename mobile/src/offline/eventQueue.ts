// Persistent FIFO queue of match events. No React Native imports: storage and sender are injected, so the
// logic runs (and is tested) under plain Node. The wiring to AsyncStorage/REST/network is in ./queue.ts.

export type EventKind = 'GOAL' | 'YELLOW' | 'RED';

export interface QueuedEvent {
  /** UUID generated on the phone: the server stores each id once (INSERT ... ON CONFLICT DO NOTHING). */
  id: string;
  matchId: string;
  participantId: string;
  playerId: string;
  type: EventKind;
  minute: number;
  /** Local time of the tap, for ordering the on-screen list. The server stamps its own created_at. */
  createdAt: string;
}

/** The server answered "no" for good (4xx): resending cannot help, so it must not block the events behind it. */
export interface RejectedEvent extends QueuedEvent {
  code: string;
  message: string;
}

export interface QueueSnapshot {
  pending: readonly QueuedEvent[];
  rejected: readonly RejectedEvent[];
}

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type Failure = { kind: 'retry' } | { kind: 'reject'; code: string; message: string };

export interface QueueDeps<R> {
  storage: QueueStorage;
  /** Resolves when the server has the event (201 or 200 "already recorded"); throws otherwise. */
  send: (event: QueuedEvent) => Promise<R>;
  /** Decides whether a failed send is worth retrying later or is a definitive rejection. */
  classify: (error: unknown) => Failure;
  storageKey?: string;
}

export type FlushResult = 'empty' | 'drained' | 'retry';

const STORAGE_KEY = 'eafc.eventQueue';
const VERSION = 1;

export class EventQueue<R = unknown> {
  private pending: QueuedEvent[] = [];
  private rejected: RejectedEvent[] = [];
  private snapshot: QueueSnapshot = { pending: [], rejected: [] };
  private loading: Promise<void> | null = null;
  private flushing: Promise<FlushResult> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly changed = new Set<() => void>();
  private readonly sent = new Set<(event: QueuedEvent, response: R) => void>();
  private readonly key: string;

  constructor(private readonly deps: QueueDeps<R>) {
    this.key = deps.storageKey ?? STORAGE_KEY;
  }

  getSnapshot(): QueueSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.changed.add(listener);
    return () => this.changed.delete(listener);
  }

  /** Called after the server accepted an event and before it leaves the queue's memory. */
  onSent(listener: (event: QueuedEvent, response: R) => void): () => void {
    this.sent.add(listener);
    return () => this.sent.delete(listener);
  }

  /** Reads the persisted queue once. Safe to call many times. A corrupt file is ignored, not fatal. */
  load(): Promise<void> {
    if (!this.loading) this.loading = this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    try {
      const raw = await this.deps.storage.getItem(this.key);
      if (!raw) return;
      const data = JSON.parse(raw) as { v?: number; pending?: QueuedEvent[]; rejected?: RejectedEvent[] };
      if (data.v !== VERSION) return;
      // Anything enqueued while loading (should not happen: callers await load) goes after the stored ones.
      const stored = Array.isArray(data.pending) ? data.pending : [];
      const known = new Set(this.pending.map((e) => e.id));
      this.pending = [...stored.filter((e) => !known.has(e.id)), ...this.pending];
      this.rejected = Array.isArray(data.rejected) ? data.rejected : [];
    } catch {
      // unreadable storage: start empty rather than crash the app
    } finally {
      this.publish();
    }
  }

  /**
   * Stores the event durably BEFORE returning: if this resolves, the event survives a crash or a closed app.
   * Re-enqueueing an id that is already queued is a no-op. Rejects (and keeps nothing) if storage fails.
   */
  async enqueue(event: QueuedEvent): Promise<void> {
    await this.load();
    if (this.pending.some((e) => e.id === event.id)) return;
    this.pending = [...this.pending, event];
    try {
      await this.persist();
    } catch (error) {
      this.pending = this.pending.filter((e) => e.id !== event.id);
      this.publish();
      throw error;
    }
    this.publish();
  }

  /**
   * Sends the queue in order, one at a time, stopping at the first transient failure (order must be kept).
   * Concurrent calls share the same run, so an event is never in flight twice from this device.
   */
  flush(): Promise<FlushResult> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async doFlush(): Promise<FlushResult> {
    await this.load();
    if (this.pending.length === 0) return 'empty';
    while (this.pending.length > 0) {
      const head = this.pending[0];
      try {
        const response = await this.deps.send(head);
        this.pending = this.pending.slice(1);
        this.notifySent(head, response);
      } catch (error) {
        const failure = this.deps.classify(error);
        if (failure.kind === 'retry') return 'retry';
        this.pending = this.pending.slice(1);
        this.rejected = [...this.rejected, { ...head, code: failure.code, message: failure.message }];
      }
      // If this write fails the event is still stored: the next run resends it and the server answers 200.
      await this.persist().catch(() => undefined);
      this.publish();
    }
    return 'drained';
  }

  async dismissRejected(id: string): Promise<void> {
    await this.load();
    this.rejected = this.rejected.filter((e) => e.id !== id);
    await this.persist().catch(() => undefined);
    this.publish();
  }

  /** Sign-out: another account must not inherit (or send) these events. */
  async clear(): Promise<void> {
    await this.load();
    this.pending = [];
    this.rejected = [];
    this.publish();
    await this.deps.storage.removeItem(this.key).catch(() => undefined);
  }

  private notifySent(event: QueuedEvent, response: R): void {
    this.sent.forEach((listener) => {
      try {
        listener(event, response);
      } catch {
        // a UI listener must never break the delivery loop
      }
    });
  }

  private publish(): void {
    this.snapshot = { pending: this.pending, rejected: this.rejected };
    this.changed.forEach((listener) => listener());
  }

  /** Writes are chained so two quick updates cannot land out of order. */
  private persist(): Promise<void> {
    const payload = JSON.stringify({ v: VERSION, pending: this.pending, rejected: this.rejected });
    const write = this.writes.then(() => this.deps.storage.setItem(this.key, payload));
    this.writes = write.catch(() => undefined);
    return write;
  }
}
