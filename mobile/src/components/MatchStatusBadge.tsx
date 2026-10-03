import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchStatus } from '@/api/types';
import { colors, type } from '@/theme';

interface Look {
  label: string;
  short: string;
  icon: React.ComponentProps<typeof Feather>['name'] | 'dot';
  bg: string;
  fg: string;
  border?: string;
}

// design-system.md §7 "Badges de estado de partido".
export const STATUS_LOOK: Record<MatchStatus, Look> = {
  SCHEDULED: { label: 'Programado', short: 'Programado', icon: 'square', bg: colors.surface, fg: colors.textSecondary, border: colors.border },
  ACTIVE: { label: 'En juego', short: 'En juego', icon: 'dot', bg: colors.accentSoft, fg: colors.accent },
  PENDING_CONFIRMATION: { label: 'Pendiente de confirmación', short: 'Pendiente', icon: 'clock', bg: colors.warningSoft, fg: colors.warning },
  CONFIRMED: { label: 'Confirmado', short: 'Confirmado', icon: 'check', bg: colors.infoSoft, fg: colors.infoText },
  DISPUTED: { label: 'En disputa', short: 'En disputa', icon: 'alert-triangle', bg: colors.dangerSoft, fg: colors.danger },
  RESOLVED: { label: 'Resuelto', short: 'Resuelto', icon: 'shield', bg: colors.surfaceRaised, fg: colors.textPrimary },
};

export function MatchStatusBadge({ status, compact }: { status: MatchStatus; compact?: boolean }) {
  const look = STATUS_LOOK[status];
  return (
    <View style={[styles.badge, { backgroundColor: look.bg }, look.border ? { borderWidth: 1, borderColor: look.border } : null]}>
      {look.icon === 'dot' ? (
        <View style={[styles.dot, { backgroundColor: look.fg }]} />
      ) : (
        <Feather name={look.icon} size={14} color={look.fg} />
      )}
      <Text style={[type.badge, { color: look.fg }]}>{compact ? look.short : look.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 28,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
