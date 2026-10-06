import { Feather } from '@expo/vector-icons';
import { useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Eyebrow } from '@/components/Card';
import { fontsV2, palette, typeV2 } from '@/theme';

import { EventIcon } from './EventIcon';
import type { RoomEvent } from './derive';

export function EventsPanel({
  events,
  myParticipantId,
  myColor,
  otherColor,
  onDismissRejected,
}: {
  events: RoomEvent[];
  myParticipantId: string;
  /** Club colours: the side of an event is shown by alignment and this bar, not by repeating a label. */
  myColor: string;
  otherColor: string;
  onDismissRejected: (id: string) => void;
}) {
  // Events already in the list when the panel opens do not animate; a new one drops in (200 ms).
  const initialIds = useRef(new Set(events.map((e) => e.id)));
  return (
    <Card style={styles.panel}>
      <View style={styles.header}>
        <Eyebrow>Eventos en vivo</Eyebrow>
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
        renderItem={({ item }) => {
          const mine = item.participantId === myParticipantId;
          return (
            <EventRow
              event={item}
              mine={mine}
              color={mine ? myColor : otherColor}
              isNew={!initialIds.current.has(item.id)}
              onDismiss={() => onDismissRejected(item.id)}
            />
          );
        }}
      />
    </Card>
  );
}

function EventRow({
  event,
  mine,
  color,
  isNew,
  onDismiss,
}: {
  event: RoomEvent;
  mine: boolean;
  color: string;
  isNew: boolean;
  onDismiss: () => void;
}) {
  const rejected = event.state === 'rejected';
  const dir = mine ? 'row' : 'row-reverse';
  return (
    <Animated.View entering={isNew ? FadeInDown.duration(200) : undefined} style={[styles.row, { flexDirection: dir }, rejected && styles.rowRejected]}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.content}>
        <View style={[styles.main, { flexDirection: dir }]}>
          <Text style={styles.minute}>{event.minute}&apos;</Text>
          <EventIcon type={event.type} size={22} />
          <Text style={[styles.name, !mine && styles.nameRight, rejected && styles.struck]} numberOfLines={1}>
            {event.playerName}
          </Text>
          {event.state === 'pending' ? (
            <View style={styles.tag}>
              <Feather name="clock" size={12} color={palette.cardYellow} />
              <Text style={[styles.tagText, { color: palette.cardYellow }]}>Pendiente</Text>
            </View>
          ) : null}
          {rejected ? <Text style={[styles.tagText, { color: palette.dangerText }]}>Rechazado</Text> : null}
        </View>
        {rejected ? (
          <View style={styles.reasonRow}>
            <Text style={styles.reason} numberOfLines={2}>
              {event.reason ?? 'El servidor no aceptó este evento.'}
            </Text>
            <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Descartar evento rechazado">
              <Feather name="x" size={18} color={palette.textSecondary} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, padding: 12, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...typeV2.caption, color: palette.textSecondary },
  list: { flex: 1 },
  listContent: { gap: 6 },
  empty: { ...typeV2.body, color: palette.textSecondary, textAlign: 'center', marginTop: 16 },
  row: { backgroundColor: palette.panelRaised, borderRadius: 4, minHeight: 40 },
  rowRejected: { borderWidth: 1, borderColor: 'rgba(229,56,76,0.5)' },
  bar: { width: 4 },
  content: { flex: 1, paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  main: { alignItems: 'center', gap: 8 },
  minute: { fontFamily: fontsV2.display, fontSize: 22, lineHeight: 24, color: palette.paper, minWidth: 40, textAlign: 'center' },
  name: { ...typeV2.bodyStrong, color: palette.paper, flex: 1 },
  nameRight: { textAlign: 'right' },
  struck: { textDecorationLine: 'line-through', color: palette.textSecondary },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { ...typeV2.badge },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { ...typeV2.caption, flex: 1, color: palette.dangerText },
});
