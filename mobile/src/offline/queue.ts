import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isApiError } from '@/api/errors';
import { api } from '@/api/endpoints';
import type { RecordEventResponse } from '@/api/types';
import { useSessionStore } from '@/stores/sessionStore';

import { EventQueue, type Failure, type QueueSnapshot } from './eventQueue';

// 4xx means the server understood and said no (wrong team, match not active, ...): resending is pointless.
// 401 (session being refreshed), 408 and 429 are about timing, not about the event.
function classify(error: unknown): Failure {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    if (error.status !== 401 && error.status !== 408 && error.status !== 429) {
      return { kind: 'reject', code: error.code, message: error.message };
    }
  }
  return { kind: 'retry' };
}

export const eventQueue = new EventQueue<RecordEventResponse>({
  storage: AsyncStorage,
  send: ({ matchId, id, participantId, playerId, type, minute }) =>
    api.recordEvent(matchId, { id, participantId, playerId, type, minute }),
  classify,
});

/** Mirror of the queue for React. The queue object stays the source of truth. */
export const useQueueStore = create<QueueSnapshot>(() => eventQueue.getSnapshot());
eventQueue.subscribe(() => useQueueStore.setState(eventQueue.getSnapshot(), true));

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_MIN_MS;

/**
 * Tries to deliver everything now. Called when an event is recorded, when the network or the realtime link
 * comes back, and when the app returns to the foreground. If the server is unreachable it retries by itself
 * with exponential backoff (2 s ... 30 s) until the queue is empty.
 */
export async function flushQueue(): Promise<void> {
  if (useSessionStore.getState().status !== 'signedIn') return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const result = await eventQueue.flush();
  if (result === 'retry') {
    retryTimer = setTimeout(() => void flushQueue(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  } else {
    retryDelay = RETRY_MIN_MS;
  }
}

export function stopQueueRetries(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = RETRY_MIN_MS;
}

export const usePendingCount = () => useQueueStore((s) => s.pending.length);
