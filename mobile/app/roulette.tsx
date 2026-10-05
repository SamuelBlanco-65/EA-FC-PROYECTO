import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  BounceInUp,
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { AssignClubResponse, Club } from '@/api/types';
import { Button } from '@/components/Button';
import { ClubCrest } from '@/components/ClubCrest';
import { Screen } from '@/components/Screen';
import { PLACEHOLDER_SECTORS, sectorCentre, sectorsOf, Wheel } from '@/features/roulette/Wheel';
import { useSessionStore } from '@/stores/sessionStore';
import { clubColor, leagueColors, palette, textOnFill, typeV2 } from '@/theme';

const SPIN_MS = 4800;
const FULL_TURNS = 5;
const FLOOD_MS = 500;
const CREST_DELAY_MS = 450;
const NAME_DELAY_MS = 1000;
const LETTER_STAGGER_MS = 35;

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

  if (phase === 'result' && assigned) return <Reveal club={assigned.club} onContinue={() => router.replace('/home')} />;

  const leagues = Object.keys(leagueColors);
  return (
    <Screen scroll={false} banner={false} bottomInset>
      <View style={styles.header}>
        <Text style={styles.title}>Sorteo de tu club</Text>
        <Text style={styles.subtitle}>Este será tu equipo durante todo el torneo. Solo puedes girar una vez y el resultado es definitivo.</Text>
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
      </View>
    </Screen>
  );
}

/**
 * "Opening the envelope": the club colour floods the screen, the crest drops in with a bounce and the name is
 * composed letter by letter. Purely visual: the club was already decided by the server.
 */
function Reveal({ club, onContinue }: { club: Club; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const color = clubColor(club.shortName, club.primaryColor);
  const ink = textOnFill(color);

  return (
    <View style={styles.revealRoot}>
      <View style={styles.revealTop}>
        <Flood color={color} width={width} height={height} />
        <View style={[styles.revealContent, { paddingTop: insets.top + 16 }]}>
          <Animated.Text entering={FadeIn.delay(CREST_DELAY_MS)} style={[typeV2.label, { color: ink }]}>
            ¡Tu club es...!
          </Animated.Text>
          <Animated.View entering={BounceInUp.delay(CREST_DELAY_MS).duration(1000)} style={styles.crestPlate}>
            <ClubCrest crestUrl={club.crestUrl} name={club.name} size={140} />
          </Animated.View>
          <ComposedName name={club.name} color={ink} />
          <Animated.Text entering={FadeIn.delay(NAME_DELAY_MS + club.name.length * LETTER_STAGGER_MS)} style={[typeV2.body, { color: ink }]}>
            {club.league} · {club.country}
          </Animated.Text>
        </View>
      </View>
      <View style={[styles.revealFooter, { paddingBottom: insets.bottom + 16 }]}>
        <Button label="Comenzar" iconRight="arrow-right" onPress={onContinue} />
      </View>
    </View>
  );
}

/** A circle that grows from the centre until it covers the whole area (instant when reduced motion is on). */
function Flood({ color, width, height }: { color: string; width: number; height: number }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) scale.value = withTiming(1, { duration: FLOOD_MS, easing: Easing.out(Easing.cubic) });
  }, [reduce, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const diameter = Math.hypot(width, height) * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          left: (width - diameter) / 2,
          top: (height - diameter) / 2,
          backgroundColor: color,
        },
        animated,
      ]}
    />
  );
}

function ComposedName({ name, color }: { name: string; color: string }) {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  const fontSize = name.length > 14 ? 34 : 44;
  let index = 0;
  return (
    <View style={styles.name} accessible accessibilityLabel={name}>
      {words.map((word, w) => (
        <View key={w} style={styles.word}>
          {word.split('').map((letter, l) => (
            <Animated.Text
              key={l}
              entering={FadeInDown.duration(220).delay(NAME_DELAY_MS + index++ * LETTER_STAGGER_MS)}
              style={[typeV2.scoreBug, { color, fontSize, lineHeight: fontSize + 4 }]}
            >
              {letter}
            </Animated.Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, gap: 8 },
  title: { ...typeV2.titleScreen, color: palette.paper },
  subtitle: { ...typeV2.body, color: palette.textSecondary },
  wheel: { alignItems: 'center', marginTop: 32 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 8, marginTop: 24, paddingHorizontal: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  legendText: { ...typeV2.caption, color: palette.paper },
  footer: { marginTop: 'auto', paddingHorizontal: 16, gap: 12 },
  error: { ...typeV2.bodyStrong, color: palette.dangerText, textAlign: 'center' },
  revealRoot: { flex: 1, backgroundColor: palette.ink },
  revealTop: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  revealContent: { alignItems: 'center', gap: 20, paddingHorizontal: 24 },
  crestPlate: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, padding: 20 },
  name: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14 },
  word: { flexDirection: 'row' },
  revealFooter: { paddingHorizontal: 16, paddingTop: 16, backgroundColor: palette.ink },
});
