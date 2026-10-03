import { Feather } from '@expo/vector-icons';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow } from '@/components/Card';
import { colors, fonts, type } from '@/theme';

import { EventIcon } from './EventIcon';
import type { RoomEvent } from './derive';

export function EventsPanel({
  events,
  myParticipantId,
  onDismissRejected,
}: {
  events: RoomEvent[];
  myParticipantId: string;
  onDismissRejected: (id: string) => void;
}) {
  return (
    <Card style={styles.panel}>
      <View style={styles.header}>
        <Eyebrow tone="info">Eventos en vivo</Eyebrow>
        <Text style={styles.count}>
          {events.length} {events.length === 1 ? 'evento' : 'eventos'}
        </Text>
      </View>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>Aún no hay eventos. Los goles y tarjetas aparecerán aquí.</Text>}
        renderItem={({ item }) => (
          <EventRow event={item} mine={item.participantId === myParticipantId} onDismiss={() => onDismissRejected(item.id)} />
        )}
      />
    </Card>
  );
}

function EventRow({ event, mine, onDismiss }: { event: RoomEvent; mine: boolean; onDismiss: () => void }) {
  const rejected = event.state === 'rejected';
  return (
    <View style={[styles.row, rejected && styles.rowRejected]}>
      <View style={styles.main}>
        <View style={styles.minute}>
          <Text style={styles.minuteText}>{event.minute}&apos;</Text>
        </View>
        <EventIcon type={event.type} size={22} color={event.type === 'GOAL' ? colors.textPrimary : undefined} />
        <Text style={[styles.name, rejected && styles.struck]} numberOfLines={1}>
          {event.playerName}
        </Text>
        {event.state === 'pending' ? (
          <View style={styles.pending}>
            <Feather name="clock" size={12} color={colors.warning} />
            <Text style={styles.pendingText}>Pendiente</Text>
          </View>
        ) : null}
        {rejected ? (
          <View style={styles.rejectedChip}>
            <Text style={styles.rejectedText}>Rechazado</Text>
          </View>
        ) : null}
        <Text style={[styles.side, mine && { color: colors.accent }]}>{mine ? 'Tu equipo' : 'Oponente'}</Text>
      </View>
      {rejected ? (
        <View style={styles.reasonRow}>
          <Text style={styles.reason} numberOfLines={2}>
            {event.reason ?? 'El servidor no aceptó este evento.'}
          </Text>
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Descartar evento rechazado">
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, padding: 12, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...type.caption, color: colors.textSecondary },
  list: { flex: 1 },
  listContent: { gap: 6 },
  empty: { ...type.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
  row: { backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  rowRejected: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  main: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  minute: {
    minWidth: 42,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteText: { fontFamily: fonts.display, fontSize: 18, lineHeight: 20, color: colors.textPrimary },
  name: { ...type.bodyStrong, fontSize: 15, lineHeight: 18, color: colors.textPrimary, flex: 1 },
  struck: { textDecorationLine: 'line-through', color: colors.textSecondary },
  side: { ...type.eyebrow, fontSize: 11, letterSpacing: 1, color: colors.textSecondary },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pendingText: { ...type.badge, fontSize: 11, color: colors.warning },
  rejectedChip: { backgroundColor: colors.dangerSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  rejectedText: { ...type.badge, fontSize: 11, color: colors.danger },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { ...type.caption, flex: 1, color: colors.danger },
});
