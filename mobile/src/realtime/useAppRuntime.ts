import NetInfo from '@react-native-community/netinfo';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { persister } from '@/api/queryClient';
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
      if (online && wasOnline === false) realtimeService.reconnectNow();
    });
  }, []);

  useEffect(() => {
    if (status === 'signedIn') realtimeService.start();
    else realtimeService.stop();
    if (status === 'signedOut') {
      queryClient.clear();
      void persister.removeClient();
    }
  }, [status, queryClient]);

  useEffect(
    () => realtimeService.subscribe((message, info) => invalidateFor(queryClient, message, info.reconnected)),
    [queryClient],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') realtimeService.checkAlive();
    });
    return () => subscription.remove();
  }, []);
}
