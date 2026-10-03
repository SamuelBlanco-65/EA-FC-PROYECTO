import { Redirect, Stack } from 'expo-router';

import { useSessionStore } from '@/stores/sessionStore';
import { colors } from '@/theme';

export default function AuthLayout() {
  const status = useSessionStore((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
