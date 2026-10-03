import NetInfo from '@react-native-community/netinfo';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { persister, queryKeys } from '@/api/queryClient';
import type { MatchDetail } from '@/api/types';
import { eventQueue, flushQueue, stopQueueRetries } from '@/offline/queue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';

import { invalidateFor } from './invalidation';
import { realtimeService } from './RealtimeService';

/**
 * Mounted once at the root. Wires the device network to TanStack Query and the connection store, ties the
 * WebSocket to the session, turns notifications into invalidations, and wipes the cache on sign-out.
 */
export function useAppRuntime(): void {
  const queryClient = useQueryClient();
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      // isInternetReachable is null until NetInfo has probed: treat "connected, unknown" as online.
      const online = !!state.isConnected && state.isInternetReachable !== false;
      const wasOnline = useConnectionStore.getState().online;
      useConnectionStore.getState().setOnline(online);
      onlineManager.setOnline(online);
      if (online && wasOnline === false) {
        realtimeService.reconnectNow();
        void flushQueue();
      }
    });
  }, []);

  useEffect(() => {
    if (status === 'signedIn') {
      realtimeService.start();
      // Events left from a previous run (app closed offline) go out as soon as the session is back.
      void eventQueue.load().then(flushQueue);
    } else {
      realtimeService.stop();
    }
    if (status === 'signedOut') {
      stopQueueRetries();
      void eventQueue.clear();
      queryClient.clear();
      void persister.removeClient();
    }
  }, [status, queryClient]);

  useEffect(
    () =>
      realtimeService.subscribe((message, info) => {
        invalidateFor(queryClient, message, info.reconnected);
        if (message.type === 'AUTH_OK') void flushQueue();
      }),
    [queryClient],
  );

  // Show a delivered event in the room immediately, without waiting for the refetch (the refetch then agrees).
  useEffect(
    () =>
      eventQueue.onSent((queued, { alreadyRecorded: _alreadyRecorded, ...sent }) => {
        queryClient.setQueryData<MatchDetail>(queryKeys.match(queued.matchId), (old) =>
          old && !old.events.some((e) => e.id === sent.id) ? { ...old, events: [...old.events, sent] } : old,
        );
      }),
    [queryClient],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        realtimeService.checkAlive();
        void flushQueue();
      }
    });
    return () => subscription.remove();
  }, []);
}
