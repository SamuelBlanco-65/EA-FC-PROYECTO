import { create } from 'zustand';

export type SocketState = 'idle' | 'connecting' | 'connected' | 'authenticated' | 'reconnecting' | 'disconnected';

interface ConnectionState {
  /** Device network (NetInfo). `null` until the first reading. */
  online: boolean | null;
  socket: SocketState;
  setOnline: (online: boolean) => void;
  setSocket: (socket: SocketState) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  online: null,
  socket: 'idle',
  setOnline: (online) => set({ online }),
  setSocket: (socket) => set({ socket }),
}));
