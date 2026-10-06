import { Feather } from '@expo/vector-icons';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FixtureTeam } from '@/api/types';
import { Button } from '@/components/Button';
import { Scorebug } from '@/components/Scorebug';
import { tapLight } from '@/haptics';
import { clubColor, palette, radius, typeV2 } from '@/theme';

interface Props {
  visible: boolean;
  home: FixtureTeam;
  away: FixtureTeam;
  homeScore: number;
  awayScore: number;
  /** Which action is running ("confirm" | "reject"), so only that button spins. */
  busy: 'confirm' | 'reject' | null;
  online: boolean;
  error: string | null;
  onConfirm: () => void;
  onReject: () => void;
  /** Android back: leave the room; the question comes back next time because the match is still pending. */
  onLeave: () => void;
}

export function ResultModal({ visible, home, away, homeScore, awayScore, busy, online, error, onConfirm, onReject, onLeave }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const blocked = busy !== null || !online;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['landscape', 'portrait']}
      onRequestClose={onLeave}
    >
      <View style={[styles.backdrop, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <View style={[styles.sheet, { width: Math.min(width - 24, 620), maxHeight: height - 16 }]}>
          <View style={styles.pill}>
            <Feather name="clock" size={15} color={palette.cardYellow} />
            <Text style={styles.pillText}>Pendiente de tu confirmación</Text>
          </View>
          <Text style={styles.title}>El local registró el resultado final</Text>

          <View style={styles.bug}>
            <Scorebug
              variant="compact"
              mine="away"
              home={{ code: home.shortName, name: home.name, crestUrl: home.crestUrl, color: clubColor(home.shortName), score: homeScore }}
              away={{ code: away.shortName, name: away.name, crestUrl: away.crestUrl, color: clubColor(away.shortName), score: awayScore }}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!online ? <Text style={styles.offline}>Requiere conexión para responder.</Text> : null}

          <View style={styles.buttons}>
            <Button
              label="Confirmar"
              icon="check"
              loading={busy === 'confirm'}
              disabled={blocked}
              onPress={() => {
                tapLight();
                onConfirm();
              }}
              style={styles.button}
            />
            <Button
              label="Rechazar"
              icon="x"
              variant="secondary"
              loading={busy === 'reject'}
              disabled={blocked}
              onPress={() => {
                tapLight();
                onReject();
              }}
              style={styles.button}
            />
          </View>
          <Text style={styles.note}>Si rechazas, el partido pasará a disputa y lo resolverá el administrador.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: palette.panelRaised,
    borderRadius: radius.modal,
    borderWidth: 1,
    borderColor: palette.signalBorder,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { ...typeV2.label, color: palette.cardYellow },
  title: { ...typeV2.titleClub, color: palette.paper, textAlign: 'center' },
  bug: { alignSelf: 'stretch' },
  buttons: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  button: { flex: 1 },
  note: { ...typeV2.caption, color: palette.textSecondary, textAlign: 'center' },
  error: { ...typeV2.bodyStrong, color: palette.dangerText, textAlign: 'center' },
  offline: { ...typeV2.bodyStrong, color: palette.cardYellow, textAlign: 'center' },
});
