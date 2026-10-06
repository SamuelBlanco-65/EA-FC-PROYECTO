import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { realtimeService } from '@/realtime/RealtimeService';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { fontsV2, palette } from '@/theme';

export type BannerMode = 'offline' | 'connecting' | null;

/** offline = the phone has no network; connecting = network is fine but the realtime link is not up yet. */
export function useBannerMode(): BannerMode {
  const online = useConnectionStore((s) => s.online);
  const socket = useConnectionStore((s) => s.socket);
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
  if (online === false) return 'offline';
  if (signedIn && online && socket !== 'authenticated' && socket !== 'idle') return 'connecting';
  return null;
}

/** The single, thin connection signal (design-system-v2.md §7 "Estados"). */
export function ConnectionBanner({ mode }: { mode: Exclude<BannerMode, null> }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const retry = () => {
    void NetInfo.refresh();
    realtimeService.reconnectNow();
    void queryClient.invalidateQueries();
  };

  const offline = mode === 'offline';
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
      <Feather name={offline ? 'wifi-off' : 'wifi'} size={16} color={palette.onSignal} />
      <Text style={styles.text} numberOfLines={1}>
        {offline ? 'Sin conexión · datos guardados' : 'Conectando · el servidor puede estar dormido'}
      </Text>
      <Pressable onPress={retry} hitSlop={8} accessibilityRole="button">
        <Text style={styles.retry}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: palette.cardYellow,
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: { flex: 1, fontFamily: fontsV2.semibold, fontSize: 13, lineHeight: 18, color: palette.onSignal },
  retry: { fontFamily: fontsV2.bold, fontSize: 13, lineHeight: 18, color: palette.onSignal, textDecorationLine: 'underline' },
});
