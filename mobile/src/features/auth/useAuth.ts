import { useMutation } from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { useSessionStore } from '@/stores/sessionStore';

// On success the session store flips to signedIn; the (auth) layout then redirects to the gate by itself.
export function useLogin() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email.trim().toLowerCase(), password),
    onSuccess: (session) => useSessionStore.getState().setSession(session),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: ({ email, password, displayName }: { email: string; password: string; displayName: string }) =>
      api.register(email.trim().toLowerCase(), password, displayName.trim()),
    onSuccess: (session) => useSessionStore.getState().setSession(session),
  });
}

// Local only, by design (docs/design/screens.md, Perfil): works offline and needs no server call.
export const signOut = () => useSessionStore.getState().signOut();
