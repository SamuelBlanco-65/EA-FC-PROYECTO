import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { isApiError } from './errors';

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // gcTime must be >= the persister's maxAge, otherwise restored entries are collected right away.
      gcTime: CACHE_MAX_AGE_MS,
      staleTime: 15_000,
      // A 4xx is an answer (not a participant, no tournament): retrying cannot change it.
      retry: (failures, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'eafc.queryCache',
  throttleTime: 1000,
});

// Bump when the shape of a cached response changes: old caches are then discarded instead of misread.
export const CACHE_BUSTER = 'v2';
