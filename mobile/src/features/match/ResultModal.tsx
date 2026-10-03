import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FixtureTeam } from '@/api/types';
import { ClubCrest } from '@/components/ClubCrest';
import { colors, fonts, radii, shadows, type } from '@/theme';

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
            <Feather name="clock" size={15} color={colors.warning} />
            <Text style={styles.pillText}>Pendiente de tu confirmación</Text>
          </View>
          <Text style={styles.title}>El local registró el resultado final</Text>

          <View style={styles.versus}>
            <Team team={home} role="Local" mine={false} />
            <View style={styles.score}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreDigit}>{homeScore}</Text>
              </View>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreDigit}>{awayScore}</Text>
              </View>
            </View>
            <Team team={away} role="Visitante" mine />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!online ? <Text style={styles.offline}>Requiere conexión para responder.</Text> : null}

          <View style={styles.buttons}>
            <Pressable
              onPress={onConfirm}
              disabled={blocked}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked, busy: busy === 'confirm' }}
              style={({ pressed }) => [styles.buttonWrap, !blocked && shadows.glowAccent, blocked && styles.dim, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[colors.accentGradientTop, colors.accentGradientBottom]} style={styles.button}>
                {busy === 'confirm' ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <>
                    <Feather name="check" size={22} color={colors.textOnAccent} />
                    <Text style={[type.button, { color: colors.textOnAccent }]}>Confirmar</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={onReject}
              disabled={blocked}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked, busy: busy === 'reject' }}
              style={({ pressed }) => [styles.buttonWrap, !blocked && shadows.glowDanger, blocked && styles.dim, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={['#FF6B78', colors.danger]} style={styles.button}>
                {busy === 'reject' ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <>
                    <Feather name="x" size={22} color={colors.textOnAccent} />
                    <Text style={[type.button, { color: colors.textOnAccent }]}>Rechazar</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
          <Text style={styles.note}>Si rechazas, el partido pasará a disputa y lo resolverá el administrador.</Text>
        </View>
      </View>
    </Modal>
  );
}

function Team({ team, role, mine }: { team: FixtureTeam; role: string; mine: boolean }) {
  return (
    <View style={styles.team}>
      <ClubCrest crestUrl={team.crestUrl} name={team.name} size={52} />
      <Text style={styles.teamName} numberOfLines={2}>
        {team.name}
      </Text>
      <Text style={[styles.teamRole, mine && { color: colors.accent, fontFamily: fonts.bold }]}>{mine ? 'Tu equipo' : role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.modal,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { ...type.eyebrow, color: colors.warning },
  title: { ...type.titleCard, fontSize: 24, lineHeight: 26, color: colors.textPrimary, textAlign: 'center' },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  team: { flex: 1, alignItems: 'center', gap: 4 },
  teamName: { ...type.bodyStrong, fontFamily: fonts.bold, fontSize: 16, lineHeight: 19, color: colors.textPrimary, textAlign: 'center' },
  teamRole: { ...type.caption, color: colors.textSecondary },
  score: { flexDirection: 'row', gap: 8 },
  scoreBox: {
    width: 54,
    height: 66,
    borderRadius: radii.digit,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDigit: { ...type.scoreDigit, color: colors.textPrimary },
  buttons: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  buttonWrap: { flex: 1, borderRadius: radii.button },
  button: { height: 54, borderRadius: radii.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  dim: { opacity: 0.5 },
  note: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  error: { ...type.bodyStrong, fontSize: 14, color: colors.danger, textAlign: 'center' },
  offline: { ...type.bodyStrong, fontSize: 14, color: colors.warning, textAlign: 'center' },
});
