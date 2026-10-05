import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Player } from '@/api/types';
import { Button } from '@/components/Button';
import { PlayerAvatar } from '@/components/ClubCrest';
import { tapSelect } from '@/haptics';
import { palette, radius, typeV2 } from '@/theme';

import type { BoardSlot } from './lineup';

interface Props {
  visible: boolean;
  starters: readonly BoardSlot[];
  bench: readonly Player[];
  /** The starter `outId` leaves the field and `incoming` takes his slot. */
  onSwap: (outId: string, incoming: Player) => void;
  /** Open the player's card (stats) to help deciding. */
  onInfo: (player: Player) => void;
  onClose: () => void;
}

/** Pick one starter and one substitute: they swap as soon as both are chosen. Nothing is saved here (the board's Save does it). */
export function LineupSheet({ visible, starters, bench, onSwap, onInfo, onClose }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setOutId(null);
      setInId(null);
    }
  }, [visible]);

  const choose = (kind: 'out' | 'in', player: Player) => {
    const nextOut = kind === 'out' ? (outId === player.id ? null : player.id) : outId;
    const nextIn = kind === 'in' ? (inId === player.id ? null : player.id) : inId;
    if (nextOut && nextIn) {
      const incoming = bench.find((p) => p.id === nextIn);
      if (incoming) {
        onSwap(nextOut, incoming);
        tapSelect();
      }
      setOutId(null);
      setInId(null);
      return;
    }
    setOutId(nextOut);
    setInId(nextIn);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar cambios" />
        <View style={[styles.sheet, { height: Math.min(height * 0.82, 640), paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>Cambiar jugadores</Text>
          <Text style={styles.hint}>
            {outId && !inId
              ? 'Ahora toca el suplente que entra.'
              : inId && !outId
                ? 'Ahora toca el titular que sale.'
                : 'Toca un titular y un suplente para intercambiarlos. El suplente ocupa la posición del titular.'}
          </Text>

          <View style={styles.columns}>
            <Column title="Titulares" count={starters.length}>
              {starters.map((s) => (
                <Row key={s.player.id} player={s.player} selected={outId === s.player.id} onPress={() => choose('out', s.player)} onInfo={() => onInfo(s.player)} />
              ))}
            </Column>
            <Column title="Suplentes" count={bench.length}>
              {bench.length === 0 ? (
                <Text style={styles.empty}>No hay suplentes: tu plantilla solo tiene los jugadores del campo.</Text>
              ) : (
                bench.map((p) => (
                  <Row key={p.id} player={p} selected={inId === p.id} onPress={() => choose('in', p)} onInfo={() => onInfo(p)} />
                ))
              )}
            </Column>
          </View>

          <Button label="Listo" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Column({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.column}>
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle}>{title}</Text>
        <Text style={styles.columnCount}>{count}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
    </View>
  );
}

function Row({ player, selected, onPress, onInfo }: { player: Player; selected: boolean; onPress: () => void; onInfo: () => void }) {
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      {selected ? <View style={styles.bar} /> : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${player.name}, ${player.position}${player.overallRating !== null ? `, ${player.overallRating}` : ''}`}
        style={styles.rowMain}
      >
        <PlayerAvatar photoUrl={player.photoUrl} name={player.name} size={32} />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>
            {player.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {player.position.toUpperCase()} · {player.overallRating ?? '–'}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={onInfo} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Ver tarjeta de ${player.name}`} style={styles.info}>
        <Feather name="info" size={18} color={palette.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.overlay, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: palette.panelRaised,
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  title: { ...typeV2.titleClub, color: palette.paper },
  hint: { ...typeV2.caption, color: palette.textSecondary },
  columns: { flex: 1, flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: palette.line },
  columnTitle: { ...typeV2.label, color: palette.textSecondary },
  columnCount: { ...typeV2.caption, color: palette.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: palette.line },
  rowSelected: { backgroundColor: palette.ink },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: palette.paper },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 8, minWidth: 0 },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...typeV2.bodyStrong, fontSize: 14, lineHeight: 18, color: palette.paper },
  sub: { ...typeV2.caption, color: palette.textSecondary },
  info: { paddingHorizontal: 8, alignSelf: 'stretch', justifyContent: 'center' },
  empty: { ...typeV2.caption, color: palette.textSecondary, marginTop: 12 },
});
