import { create } from 'zustand';

import { clearSession, loadSession, saveSession } from '@/api/tokenStorage';
import type { Me, SessionResponse } from '@/api/types';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: Me | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Epoch seconds at which the access token expires (from `expiresIn`; never read from the client JWT). */
  expiresAt: number;
  restore: () => Promise<void>;
  setSession: (session: SessionResponse) => Promise<void>;
  signOut: () => Promise<void>;
}

const empty = { user: null, accessToken: null, refreshToken: null, expiresAt: 0 };

export const useSessionStore = create<SessionState>((set) => ({
  status: 'restoring',
  ...empty,

  // Local only (no network): an expired access token is renewed lazily by the API client on the first 401.
  restore: async () => {
    try {
      const stored = await loadSession();
      set(stored ? { status: 'signedIn', ...stored } : { status: 'signedOut', ...empty });
    } catch {
      set({ status: 'signedOut', ...empty });
    }
  },

  setSession: async (session) => {
    const expiresAt = Math.floor(Date.now() / 1000) + session.expiresIn;
    const next = { accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user, expiresAt };
    set({ status: 'signedIn', ...next });
    await saveSession(next);
  },

  signOut: async () => {
    set({ status: 'signedOut', ...empty });
    await clearSession();
  },
}));
