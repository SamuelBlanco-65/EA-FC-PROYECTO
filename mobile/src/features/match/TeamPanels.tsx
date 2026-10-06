import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EventType, FixtureTeam } from '@/api/types';
import { Card } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { palette, radius, typeV2 } from '@/theme';

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
      <View style={styles.identity}>
        <ClubCrest crestUrl={team.crestUrl} name={team.name} size={36} />
        <View style={styles.identityText}>
          <Text style={styles.clubName} numberOfLines={1}>
            {team.name}
          </Text>
          <Text style={styles.role}>Tu equipo · {ROLE[side]}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={!enabled}
          onPress={() => onPick('GOAL')}
          accessibilityRole="button"
          accessibilityLabel="Registrar gol"
          accessibilityState={{ disabled: !enabled }}
          style={({ pressed }) => [styles.goal, !enabled && styles.goalOff, pressed && enabled && styles.goalPressed]}
        >
          <EventIcon type="GOAL" size={36} color={enabled ? palette.onSignal : palette.textTertiary} />
          <Text style={[styles.goalText, { color: enabled ? palette.onSignal : palette.textTertiary }]}>Gol</Text>
        </Pressable>
        <View style={styles.cards}>
          <CardButton type="YELLOW" label="Amarilla" enabled={enabled} onPress={onPick} />
          <CardButton type="RED" label="Roja" enabled={enabled} onPress={onPick} />
        </View>
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
  const edge = yellow ? palette.cardYellow : palette.cardRed;
  const text = yellow ? palette.cardYellow : palette.dangerText;
  return (
    <Pressable
      disabled={!enabled}
      onPress={() => onPress(kind)}
      accessibilityRole="button"
      accessibilityLabel={`Registrar tarjeta ${yellow ? 'amarilla' : 'roja'}`}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [styles.cardButton, { borderColor: enabled ? edge : palette.line }, pressed && enabled && styles.cardPressed]}
    >
      <EventIcon type={kind} size={22} color={enabled ? undefined : palette.textTertiary} />
      <Text style={[styles.cardText, { color: enabled ? text : palette.textTertiary }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

/** Thin read-only column: the opponent's totals. Nothing here is tappable. */
export function OpponentPanel({ team, side, tally }: { team: FixtureTeam; side: 'home' | 'away'; tally: Tally }) {
  const stats: { type: EventType; value: number; label: string }[] = [
    { type: 'GOAL', value: tally.goals, label: 'Goles' },
    { type: 'YELLOW', value: tally.yellows, label: 'Amarillas' },
    { type: 'RED', value: tally.reds, label: 'Rojas' },
  ];
  return (
    <Card style={styles.opponent}>
      <View style={styles.identity}>
        <ClubCrest crestUrl={team.crestUrl} name={team.name} size={32} />
        <Text style={styles.code}>{team.shortName}</Text>
      </View>
      <Text style={styles.role} numberOfLines={1}>
        Oponente · {ROLE[side]}
      </Text>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.type} style={styles.stat} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
            <EventIcon type={s.type} size={20} />
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, padding: 12, paddingLeft: 16, gap: 8, justifyContent: 'space-between' },
  opponent: { flex: 1, padding: 12, gap: 6 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityText: { flex: 1 },
  clubName: { ...typeV2.rowCode, color: palette.paper },
  code: { ...typeV2.rowCode, color: palette.paper },
  role: { ...typeV2.caption, color: palette.textSecondary },
  actions: { flexDirection: 'row', gap: 8 },
  goal: {
    flex: 1.1,
    minWidth: 120,
    height: 120,
    borderRadius: radius.button,
    backgroundColor: palette.signal,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  goalOff: { backgroundColor: palette.panelRaised },
  goalPressed: { backgroundColor: palette.signalPressed, transform: [{ scale: 0.97 }] },
  goalText: { ...typeV2.button, fontSize: 28, lineHeight: 30 },
  cards: { flex: 1, gap: 8 },
  cardButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  cardPressed: { transform: [{ scale: 0.97 }] },
  cardText: { ...typeV2.button, fontSize: 18, lineHeight: 22 },
  stats: { gap: 4, marginTop: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  statValue: { ...typeV2.statBig, color: palette.paper },
});
