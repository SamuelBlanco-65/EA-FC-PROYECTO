import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CACHE_BUSTER, CACHE_MAX_AGE_MS, persister, queryClient } from '@/api/queryClient';
import { useAppRuntime } from '@/realtime/useAppRuntime';
import { useSessionStore } from '@/stores/sessionStore';
import { fontAssets, palette } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function Runtime() {
  useAppRuntime();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    void useSessionStore.getState().restore();
  }, []);

  // A font failure must not leave the app on the splash screen: it falls back to the system font.
  const ready = (fontsLoaded || !!fontError) && status !== 'restoring';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.ink }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: CACHE_BUSTER }}
        >
          <Runtime />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ink }, animation: 'fade' }} />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
