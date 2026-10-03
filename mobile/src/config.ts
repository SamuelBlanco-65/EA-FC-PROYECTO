// The only backend knowledge the app has. No Supabase URL or key lives in the mobile project.
const raw = process.env.EXPO_PUBLIC_API_URL;

if (!raw) {
  throw new Error('Falta EXPO_PUBLIC_API_URL (copia mobile/.env.example a mobile/.env y reinicia Expo con --clear).');
}

export const API_URL = raw.replace(/\/+$/, '');
export const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;

export function mediaUrl(path: string): string {
  return `${API_URL}${path}`;
}
