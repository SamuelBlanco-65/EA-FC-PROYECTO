import * as SecureStore from 'expo-secure-store';

import type { Me } from './types';

// Small separate keys instead of one JSON blob: SecureStore warns above 2048 bytes per value.
const KEYS = { access: 'eafc.accessToken', refresh: 'eafc.refreshToken', user: 'eafc.user', expires: 'eafc.expiresAt' } as const;

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: Me;
  expiresAt: number;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, session.accessToken),
    SecureStore.setItemAsync(KEYS.refresh, session.refreshToken),
    SecureStore.setItemAsync(KEYS.user, JSON.stringify(session.user)),
    SecureStore.setItemAsync(KEYS.expires, String(session.expiresAt)),
  ]);
}

export async function loadSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, user, expires] = await Promise.all([
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.user),
    SecureStore.getItemAsync(KEYS.expires),
  ]);
  if (!accessToken || !refreshToken || !user) return null;
  try {
    return { accessToken, refreshToken, user: JSON.parse(user) as Me, expiresAt: Number(expires) || 0 };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
}
