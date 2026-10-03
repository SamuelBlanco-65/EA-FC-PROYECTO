import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { realtimeService } from '@/realtime/RealtimeService';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, fonts } from '@/theme';

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
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
      <Feather name={offline ? 'wifi-off' : 'wifi'} size={22} color={colors.textOnAccent} />
      <View style={styles.texts}>
        <Text style={styles.title}>{offline ? 'Sin conexión' : 'Conectando en tiempo real…'}</Text>
        <Text style={styles.subtitle}>
          {offline ? 'Mostrando datos guardados' : 'Puede tardar si el servidor estaba dormido'}
        </Text>
      </View>
      <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
        <Text style={styles.retryText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  texts: { flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 18, color: colors.textOnAccent },
  subtitle: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 15, color: colors.textOnAccent },
  retry: { borderWidth: 1.5, borderColor: colors.textOnAccent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textOnAccent },
});
