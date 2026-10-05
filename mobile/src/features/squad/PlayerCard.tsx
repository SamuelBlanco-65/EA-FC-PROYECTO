import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Player } from '@/api/types';
import { Button } from '@/components/Button';
import { PlayerAvatar } from '@/components/ClubCrest';
import { fontsV2, palette, radius, typeV2 } from '@/theme';

import { playerSubtitle } from './groups';
import { statFill, statRows, type StatRow } from './stats';

/**
 * Bottom sheet with a player's card: overall and position, photo, name and the six stats.
 * Not a screen: it opens over the squad list (and the tactics board). Read-only.
 */
export function PlayerCard({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const rows = player ? statRows(player) : [];
  const subtitle = player ? playerSubtitle(player) : '';

  return (
    <Modal visible={player !== null} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Cerrar tarjeta" accessibilityRole="button" />
        {player ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.top}>
              <View style={styles.rating}>
                <Text style={styles.ratingText}>{player.overallRating ?? '–'}</Text>
                <Text style={styles.position}>{player.position.toUpperCase()}</Text>
              </View>
              <PlayerAvatar photoUrl={player.photoUrl} name={player.name} size={112} />
              <View style={styles.shirt}>
                <Text style={styles.shirtText}>{player.shirtNumber ?? '–'}</Text>
                <Text style={styles.shirtLabel}>Dorsal</Text>
              </View>
            </View>

            <Text style={styles.name} numberOfLines={2}>
              {player.name}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <View style={styles.stats}>
              <View style={styles.column}>
                {rows.slice(0, 3).map((r) => (
                  <Stat key={r.key} row={r} />
                ))}
              </View>
              <View style={styles.column}>
                {rows.slice(3).map((r) => (
                  <Stat key={r.key} row={r} />
                ))}
              </View>
            </View>

            <Button label="Cerrar" variant="secondary" onPress={onClose} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Stat({ row }: { row: StatRow }) {
  const fill = statFill(row.value);
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${row.name}: ${row.value ?? 'sin dato'}`}>
      <View style={styles.statHead}>
        <Text style={styles.statValue}>{row.value ?? '–'}</Text>
        <Text style={styles.statLabel}>{row.label}</Text>
      </View>
      <View style={styles.track}>{fill !== null ? <View style={[styles.fill, { width: `${Math.round(fill * 100)}%` }]} /> : null}</View>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rating: { width: 72, alignItems: 'flex-start' },
  ratingText: { fontFamily: fontsV2.displayBlack, fontSize: 56, lineHeight: 56, color: palette.paper },
  position: { ...typeV2.label, color: palette.textSecondary },
  shirt: { width: 72, alignItems: 'flex-end' },
  shirtText: { fontFamily: fontsV2.display, fontSize: 40, lineHeight: 42, color: palette.textSecondary },
  shirtLabel: { ...typeV2.caption, color: palette.textSecondary },
  name: { ...typeV2.titleClub, color: palette.paper, textAlign: 'center' },
  subtitle: { ...typeV2.caption, color: palette.textSecondary, textAlign: 'center', marginTop: -6 },
  stats: { flexDirection: 'row', gap: 24, marginTop: 4, marginBottom: 4 },
  column: { flex: 1, gap: 14 },
  stat: { gap: 4 },
  statHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  statValue: { fontFamily: fontsV2.display, fontSize: 28, lineHeight: 30, color: palette.paper },
  statLabel: { ...typeV2.label, color: palette.textSecondary },
  track: { height: 4, backgroundColor: palette.line },
  fill: { height: 4, backgroundColor: palette.paper },
});
