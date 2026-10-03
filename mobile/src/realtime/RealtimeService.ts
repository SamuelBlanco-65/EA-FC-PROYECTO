import { refreshSession } from '@/api/client';
import { WS_URL } from '@/config';
import { useConnectionStore, type SocketState } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';

import { parseServerMessage, type ServerMessage } from './events';

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
// The access token is refreshed before opening the socket if it expires within this window.
const TOKEN_MARGIN_S = 30;

export interface MessageInfo {
  /** True when this AUTH_OK follows an earlier connection: the app may have missed events and must refetch. */
  reconnected: boolean;
}
type Listener = (message: ServerMessage, info: MessageInfo) => void;

/**
 * The only WebSocket of the app (screens use hooks, never sockets).
 * States: idle -> connecting -> connected (open, AUTH sent) -> authenticated; on loss: reconnecting (exponential
 * backoff with jitter, capped) or disconnected (device offline: waits for the network instead of retrying).
 */
class RealtimeService {
  private socket: WebSocket | null = null;
  private running = false;
  private attempt = 0;
  private everAuthenticated = false;
  private lastAuthError: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.everAuthenticated = false;
    void this.open();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.detachSocket();
    this.everAuthenticated = false;
    this.setState('idle');
  }

  /** Network came back, app returned to the foreground, or the user pressed "Reintentar". */
  reconnectNow(): void {
    if (!this.running) return;
    this.clearTimers();
    this.detachSocket();
    this.attempt = 0;
    void this.open();
  }

  /** Foreground check: a socket that looks open may be dead after the phone slept. */
  checkAlive(): void {
    if (!this.running) return;
    if (this.socket && useConnectionStore.getState().socket === 'authenticated') this.sendPing();
    else this.reconnectNow();
  }

  private setState(state: SocketState): void {
    if (useConnectionStore.getState().socket !== state) useConnectionStore.getState().setSocket(state);
  }

  private async open(): Promise<void> {
    this.setState(this.everAuthenticated || this.attempt > 0 ? 'reconnecting' : 'connecting');
    this.lastAuthError = null;

    let token = useSessionStore.getState().accessToken;
    if (!token) return;
    if (useSessionStore.getState().expiresAt - Date.now() / 1000 < TOKEN_MARGIN_S) {
      try {
        token = await refreshSession();
      } catch {
        this.scheduleReconnect();
        return;
      }
    }
    if (!this.running || this.socket) return;

    const ws = new WebSocket(WS_URL);
    this.socket = ws;
    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.setState('connected');
      // The token travels in the first message, not in the URL (URLs end up in proxy logs).
      ws.send(JSON.stringify({ type: 'AUTH', token }));
    };
    ws.onmessage = (event) => {
      if (this.socket === ws) this.handle(event.data);
    };
    ws.onerror = () => {
      // Always followed by onclose, which owns the recovery.
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      void this.onLost();
    };
  }

  private handle(raw: unknown): void {
    const message = parseServerMessage(raw);
    if (!message) return;
    switch (message.type) {
      case 'AUTH_OK': {
        this.attempt = 0;
        const reconnected = this.everAuthenticated;
        this.everAuthenticated = true;
        this.setState('authenticated');
        this.startPing();
        this.emit(message, { reconnected });
        return;
      }
      case 'PONG':
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      case 'AUTH_ERROR':
        // The close frame does not survive Render's proxy; this data frame does (docs/architecture/deploy.md).
        this.lastAuthError = message.code;
        return;
      default:
        this.emit(message, { reconnected: false });
    }
  }

  private async onLost(): Promise<void> {
    this.clearTimers();
    if (!this.running) return;
    if (useConnectionStore.getState().online === false) {
      this.setState('disconnected');
      return;
    }
    if (this.lastAuthError === 'TOKEN_EXPIRED' || this.lastAuthError === 'INVALID_TOKEN') {
      try {
        await refreshSession();
      } catch {
        // refresh failed: if the refresh token is dead the session store signs out and stops us
      }
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    this.setState('reconnecting');
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
  }

  private sendPing(): void {
    if (!this.socket || this.pongTimer) return;
    try {
      this.socket.send(JSON.stringify({ type: 'PING' }));
    } catch {
      return;
    }
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      // No PONG: the link is dead even if the OS has not noticed. Closing triggers onclose -> reconnect.
      this.socket?.close();
    }, PONG_TIMEOUT_MS);
  }

  private emit(message: ServerMessage, info: MessageInfo): void {
    this.listeners.forEach((listener) => listener(message, info));
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.reconnectTimer = this.pingTimer = this.pongTimer = null;
  }

  private detachSocket(): void {
    const ws = this.socket;
    this.socket = null;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }
}

export const realtimeService = new RealtimeService();
