import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EventType, FixtureTeam } from '@/api/types';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { colors, fonts, radii, shadows, type } from '@/theme';

import { EventIcon } from './EventIcon';
import type { Tally } from './derive';

const ROLE = { home: 'Local', away: 'Visitante' } as const;

export function MyTeamPanel({
  team,
  side,
  enabled,
  onPick,
}: {
  team: FixtureTeam;
  side: 'home' | 'away';
  /** Only while the match is ACTIVE. The server checks it again on every event. */
  enabled: boolean;
  onPick: (type: EventType) => void;
}) {
  return (
    <Card variant="highlight" style={styles.panel}>
      <Eyebrow>Tu equipo</Eyebrow>
      <View style={styles.identity}>
        <ClubCrest crestUrl={team.crestUrl} name={team.name} size={52} />
        <View style={styles.identityText}>
          <Text style={styles.clubName} numberOfLines={2}>
            {team.name}
          </Text>
          <Text style={styles.role}>{ROLE[side]}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={!enabled}
          onPress={() => onPick('GOAL')}
          accessibilityRole="button"
          accessibilityLabel="Registrar gol"
          style={({ pressed }) => [styles.actionWrap, !enabled && styles.dim, pressed && styles.pressed, enabled && shadows.glowAccent]}
        >
          <LinearGradient colors={[colors.accentGradientTop, colors.accentGradientBottom]} style={styles.action}>
            <EventIcon type="GOAL" size={30} color={colors.textOnAccent} />
            <Text style={[styles.actionText, { color: colors.textOnAccent }]}>Gol</Text>
          </LinearGradient>
        </Pressable>
        <CardButton type="YELLOW" label="Amarilla" enabled={enabled} onPress={onPick} />
        <CardButton type="RED" label="Roja" enabled={enabled} onPress={onPick} />
      </View>
    </Card>
  );
}

function CardButton({
  type: kind,
  label,
  enabled,
  onPress,
}: {
  type: 'YELLOW' | 'RED';
  label: string;
  enabled: boolean;
  onPress: (type: EventType) => void;
}) {
  const yellow = kind === 'YELLOW';
  const tone = yellow ? colors.warning : colors.danger;
  return (
    <Pressable
      disabled={!enabled}
      onPress={() => onPress(kind)}
      accessibilityRole="button"
      accessibilityLabel={`Registrar tarjeta ${yellow ? 'amarilla' : 'roja'}`}
      style={({ pressed }) => [
        styles.actionWrap,
        styles.action,
        { backgroundColor: yellow ? colors.warningSoft : colors.dangerSoft, borderColor: tone, borderWidth: 1.5 },
        !enabled && styles.dim,
        pressed && styles.pressed,
      ]}
    >
      <EventIcon type={kind} size={30} />
      <Text style={[styles.actionText, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

export function OpponentPanel({ team, side, tally }: { team: FixtureTeam; side: 'home' | 'away'; tally: Tally }) {
  const stats = [
    { label: 'Goles', value: tally.goals },
    { label: 'Amarillas', value: tally.yellows },
    { label: 'Rojas', value: tally.reds },
  ];
  return (
    <Card variant="dashed" style={styles.panel}>
      <View style={styles.opponentHeader}>
        <Eyebrow tone="info">Oponente</Eyebrow>
        <View style={styles.readOnly}>
          <Feather name="lock" size={13} color={colors.textSecondary} />
          <Text style={styles.readOnlyText}>Solo lectura</Text>
        </View>
      </View>
      <View style={styles.identity}>
        <ClubCrest crestUrl={team.crestUrl} name={team.name} size={52} />
        <View style={styles.identityText}>
          <Text style={[styles.clubName, { color: colors.textSecondary }]} numberOfLines={2}>
            {team.name}
          </Text>
          <Text style={styles.role}>{ROLE[side]}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, padding: 12, gap: 8, justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityText: { flex: 1 },
  clubName: { ...type.titleCard, fontSize: 22, lineHeight: 24, color: colors.textPrimary },
  role: { ...type.body, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8 },
  actionWrap: { flex: 1, borderRadius: radii.button },
  action: { height: 74, borderRadius: radii.button, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontFamily: fonts.displayItalic, fontSize: 18, lineHeight: 20, textTransform: 'uppercase' },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  opponentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readOnlyText: { ...type.caption, color: colors.textSecondary },
  stat: {
    flex: 1,
    height: 74,
    borderRadius: radii.button,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { ...type.statValue, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textSecondary },
});
