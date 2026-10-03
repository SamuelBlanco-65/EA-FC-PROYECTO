import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { cancelAnimation, Easing, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { AssignClubResponse, Club } from '@/api/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { Screen } from '@/components/Screen';
import { PLACEHOLDER_SECTORS, sectorCentre, sectorsOf, Wheel } from '@/features/roulette/Wheel';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, leagueColors, type } from '@/theme';

const SPIN_MS = 4800;
const FULL_TURNS = 5;

type Phase = 'idle' | 'spinning' | 'result';

export default function Roulette() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useSessionStore((s) => s.status);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 340);

  const rotation = useSharedValue(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sectors, setSectors] = useState(PLACEHOLDER_SECTORS);
  const [assigned, setAssigned] = useState<AssignClubResponse | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(rotation);
    },
    [rotation],
  );

  const assign = useMutation({
    mutationFn: api.assignClub,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.participation, { participant: result.participant, club: result.club });
      if (result.alreadyAssigned) {
        // I already have a club: no animation, straight to home.
        cancelAnimation(rotation);
        router.replace('/home');
        return;
      }
      // The SERVER already chose the club; the wheel only decides where to stop.
      const index = Math.max(0, result.rouletteClubs.findIndex((c) => c.id === result.club.id));
      const count = result.rouletteClubs.length;
      const jitter = (Math.random() - 0.5) * (360 / count) * 0.6; // stay inside the sector
      const desired = (((-sectorCentre(index, count) + jitter) % 360) + 360) % 360;
      const current = rotation.value;
      const target = Math.ceil((current + FULL_TURNS * 360 - desired) / 360) * 360 + desired;

      setSectors(sectorsOf(result.rouletteClubs));
      setAssigned(result);
      rotation.value = withTiming(target, { duration: SPIN_MS, easing: Easing.out(Easing.cubic) });
      timer.current = setTimeout(() => setPhase('result'), SPIN_MS + 100);
    },
    onError: () => {
      cancelAnimation(rotation);
      setPhase('idle');
    },
  });

  if (status === 'signedOut') return <Redirect href="/login" />;

  const spin = () => {
    if (phase !== 'idle' || assign.isPending) return;
    setPhase('spinning');
    // Waiting for the server: keep the wheel turning at a steady speed.
    rotation.value = withRepeat(withTiming(rotation.value + 360, { duration: 900, easing: Easing.linear }), -1);
    assign.mutate();
  };

  if (phase === 'result' && assigned) return <Result club={assigned.club} onContinue={() => router.replace('/home')} />;

  const leagues = Object.keys(leagueColors);
  return (
    <Screen glow="blue" scroll={false} banner={false} bottomInset>
      <View style={styles.header}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>SORTEO ÚNICO</Text>
        </View>
        <Text style={styles.title}>Sorteo de tu club</Text>
        <Text style={styles.subtitle}>Este será tu equipo durante todo el torneo</Text>
      </View>

      <View style={styles.wheel}>
        <Wheel size={size} sectors={sectors} rotation={rotation} />
      </View>

      <View style={styles.legend}>
        {leagues.map((league) => (
          <View key={league} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: leagueColors[league] }]} />
            <Text style={styles.legendText}>{league}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        {assign.isError ? <Text style={styles.error}>{errorMessage(assign.error)}</Text> : null}
        <Button
          label={phase === 'spinning' ? 'Sorteando...' : 'Girar'}
          icon={phase === 'idle' ? 'rotate-cw' : undefined}
          loading={phase === 'spinning'}
          onPress={spin}
        />
        <Text style={styles.note}>Solo puedes girar una vez. El resultado es definitivo.</Text>
      </View>
    </Screen>
  );
}

function Result({ club, onContinue }: { club: Club; onContinue: () => void }) {
  return (
    <Screen glow="green" scroll={false} banner={false} bottomInset>
      <View style={styles.header}>
        <View style={[styles.pill, styles.pillDone]}>
          <Text style={[styles.pillText, { color: colors.accent }]}>SORTEO COMPLETADO</Text>
        </View>
        <Text style={styles.title}>Sorteo de tu club</Text>
        <Text style={styles.subtitle}>Este será tu equipo durante todo el torneo</Text>
      </View>

      <View style={styles.resultWrap}>
        <Card variant="highlight" style={styles.resultCard}>
          <Text style={styles.resultKicker}>¡Tu club es...!</Text>
          <ClubCrest crestUrl={club.crestUrl} name={club.name} size={150} style={styles.resultCrest} />
          <Text style={styles.resultName} adjustsFontSizeToFit numberOfLines={2}>
            {club.name}
          </Text>
          <View style={styles.chips}>
            <Chip label="Liga" value={club.league} />
            <Chip label="País" value={club.country} />
          </View>
        </Card>
      </View>

      <View style={styles.footer}>
        <Button label="Comenzar" iconRight="arrow-right" onPress={onContinue} />
      </View>
    </Screen>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingHorizontal: 16 },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 8,
    marginBottom: 18,
  },
  pillDone: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pillText: { ...type.eyebrow, fontSize: 14, color: colors.textSecondary, letterSpacing: 3 },
  title: { ...type.titleHero, fontSize: 44, lineHeight: 46, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: 6 },
  wheel: { alignItems: 'center', marginTop: 36 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 28, paddingHorizontal: 20 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { ...type.bodyStrong, color: colors.textPrimary },
  footer: { marginTop: 'auto', paddingHorizontal: 16, gap: 12 },
  error: { ...type.bodyStrong, color: colors.danger, textAlign: 'center' },
  note: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  resultWrap: { paddingHorizontal: 16, marginTop: 32 },
  resultCard: { alignItems: 'center', paddingVertical: 24, backgroundColor: colors.surfaceRaised },
  resultKicker: { ...type.titleCard, color: colors.accent, fontSize: 30 },
  resultCrest: { marginVertical: 24 },
  resultName: { ...type.titleHero, fontSize: 46, lineHeight: 48, color: colors.textPrimary, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 12, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipLabel: { ...type.eyebrow, color: colors.textSecondary, letterSpacing: 1.5 },
  chipValue: { ...type.bodyStrong, color: colors.textPrimary },
});
