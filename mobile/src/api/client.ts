import { API_URL } from '@/config';
import { useSessionStore } from '@/stores/sessionStore';

import { ApiError } from './errors';
import type { SessionResponse } from './types';

// Render's free tier can need up to ~1 min to wake up (docs/architecture/deploy.md), so the timeout is generous.
const TIMEOUT_MS = 60_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false for login/register/refresh: no token, and a 401 there is an answer, not an expired session. */
  auth?: boolean;
}

async function rawRequest(path: string, { method = 'GET', body, auth = true }: RequestOptions, token: string | null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (controller.signal.aborted) throw new ApiError('TIMEOUT', 'El servidor tardó demasiado en responder.', 0);
    throw new ApiError('NETWORK_ERROR', 'No hay conexión con el servidor.', 0);
  } finally {
    clearTimeout(timer);
  }
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const data = await response.json();
    const err = data?.error;
    if (err && typeof err.code === 'string') {
      return new ApiError(err.code, err.message ?? 'Error del servidor.', response.status, err.details ?? {});
    }
  } catch {
    // body was not JSON (a proxy error page): fall through to the generic error
  }
  return new ApiError(`HTTP_${response.status}`, 'Error del servidor.', response.status);
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// One refresh at a time: several requests failing with 401 together must not use the (single-use) refresh token twice.
let refreshing: Promise<string> | null = null;

/** Exchanges the refresh token for a new session and returns the new access token. Shared with the WebSocket. */
export function refreshSession(): Promise<string> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(): Promise<string> {
  const { refreshToken, setSession, signOut } = useSessionStore.getState();
  if (!refreshToken) throw new ApiError('NOT_AUTHENTICATED', 'Sesión expirada.', 401);
  const response = await rawRequest('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false }, null);
  if (!response.ok) {
    const error = await toError(response);
    // Only a definitive "this refresh token is dead" ends the session. Network trouble or a 5xx keeps it.
    if (error.status === 401) await signOut();
    throw error;
  }
  const session = (await response.json()) as SessionResponse;
  await setSession(session);
  return session.accessToken;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  const response = await rawRequest(path, options, useSessionStore.getState().accessToken);
  if (response.status !== 401 || !auth) return parse<T>(response);

  // Expired or invalid access token: refresh once and retry once.
  const token = await refreshSession();
  return parse<T>(await rawRequest(path, options, token));
}
