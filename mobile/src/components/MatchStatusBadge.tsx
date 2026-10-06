import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { MatchStatus } from '@/api/types';
import { palette, radius, typeV2 } from '@/theme';

interface Look {
  label: string;
  short: string;
  icon: React.ComponentProps<typeof Feather>['name'] | 'dot';
  fg: string;
}

// design-system-v2.md §3: status = dot/icon + text without background; only ACTIVE (EN VIVO) is a filled chip.
const STATUS_LOOK: Record<MatchStatus, Look> = {
  SCHEDULED: { label: 'Programado', short: 'Programado', icon: 'dot', fg: palette.textSecondary },
  ACTIVE: { label: 'En vivo', short: 'En vivo', icon: 'dot', fg: palette.onSignal },
  PENDING_CONFIRMATION: { label: 'Pendiente de confirmación', short: 'Pendiente', icon: 'clock', fg: palette.cardYellow },
  CONFIRMED: { label: 'Confirmado', short: 'Confirmado', icon: 'check', fg: palette.positive },
  DISPUTED: { label: 'En disputa', short: 'En disputa', icon: 'alert-triangle', fg: palette.dangerText },
  RESOLVED: { label: 'Resuelto', short: 'Resuelto', icon: 'shield', fg: palette.paper },
};

/** The only permanent loop of the app (design-system-v2.md §8): opacity pulse, 1.2 s. */
function LiveDot({ color }: { color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [progress]);
  const animated = useAnimatedStyle(() => ({ opacity: 1 - progress.value * 0.65 }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animated]} />;
}

export function MatchStatusBadge({ status, compact }: { status: MatchStatus; compact?: boolean }) {
  const look = STATUS_LOOK[status];
  const live = status === 'ACTIVE';
  const icon =
    live ? (
      <LiveDot color={look.fg} />
    ) : look.icon === 'dot' ? (
      <View style={[styles.dot, { backgroundColor: look.fg }]} />
    ) : (
      <Feather name={look.icon} size={14} color={look.fg} />
    );
  return (
    <View style={[styles.badge, live && styles.live]}>
      {icon}
      <Text style={[typeV2.badge, { color: look.fg }, live && styles.liveText]}>{compact ? look.short : look.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 20 },
  live: { backgroundColor: palette.signal, borderRadius: radius.badge, paddingHorizontal: 8, paddingVertical: 3 },
  liveText: { textTransform: 'uppercase', letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
