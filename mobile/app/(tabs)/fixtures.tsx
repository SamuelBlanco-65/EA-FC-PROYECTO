import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Fixture, MatchStatus, StandingRow } from '@/api/types';
import { Button } from '@/components/Button';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { canEnterRoom, isMine, restingIn, summarizeRounds, type RoundSummary } from '@/features/tournament/derive';
import { useFixtures, useStandings, useTournament } from '@/features/tournament/hooks';
import { colors, fonts, shadows, type } from '@/theme';

const LEGEND: MatchStatus[] = ['SCHEDULED', 'ACTIVE', 'PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'RESOLVED'];

export default function Fixtures() {
  const participation = useMyParticipation();
  const tournament = useTournament();
  const fixtures = useFixtures();
  const standings = useStandings();
  const [picked, setPicked] = useState<number | null>(null);
  const queries = [tournament, fixtures];
  const refreshing = [...queries, standings].some((q) => q.isFetching && !q.isPending);

  const rounds = summarizeRounds(fixtures.data ?? []);
  const current = tournament.data?.currentRound ?? 0;
  const fallback = rounds.find((r) => r.round === current) ?? rounds[0];
  const selected = rounds.find((r) => r.round === picked) ?? fallback;
  const perRound = rounds.length > 0 ? Math.max(...rounds.map((r) => r.matches.length)) : 0;

  return (
    <Screen
      onRefresh={() => [...queries, standings, participation].forEach((q) => void q.refetch())}
      refreshing={refreshing}
    >
      <Eyebrow>{rounds.length > 0 ? `${rounds.length} fechas · ${perRound} partidos por fecha` : 'Calendario'}</Eyebrow>
      <Text style={styles.title}>Calendario</Text>

      <QueryBoundary
        queries={queries}
        skeleton={
          <View style={styles.stack}>
            <Skeleton height={70} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </View>
        }
      >
        {rounds.length === 0 || !selected ? (
          <EmptyState
            title="Calendario sin generar"
            message="Los partidos aparecerán cuando el administrador inicie el torneo."
          />
        ) : (
          <>
            <RoundChips rounds={rounds} current={current} selected={selected.round} onPick={setPicked} />
            <View style={styles.roundHeader}>
              <Text style={styles.roundTitle}>
                Fecha {selected.round} · {selected.matches.length} {selected.matches.length === 1 ? 'partido' : 'partidos'}
              </Text>
              <Text style={styles.roundState}>
                {selected.closed ? 'Completada' : selected.round === current ? 'En curso' : selected.round > current ? 'Pendiente' : 'Abierta'}
              </Text>
            </View>
            <View style={styles.stack}>
              {selected.matches.map((m) => (
                <MatchCard key={m.id} match={m} mine={!!participation.data && isMine(m, participation.data.participant.id)} />
              ))}
              {restingIn(selected.matches, standings.data ?? []).map((row) => (
                <RestCard key={row.participantId} row={row} />
              ))}
            </View>
            <Card style={styles.legend}>
              <Eyebrow>Estados</Eyebrow>
              <View style={styles.legendBadges}>
                {LEGEND.map((s) => (
                  <MatchStatusBadge key={s} status={s} compact />
                ))}
              </View>
            </Card>
          </>
        )}
      </QueryBoundary>
    </Screen>
  );
}

function RoundChips({
  rounds,
  current,
  selected,
  onPick,
}: {
  rounds: RoundSummary[];
  current: number;
  selected: number;
  onPick: (round: number) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
      {rounds.map((r) => {
        const active = r.round === current;
        const future = r.round > current;
        const isSelected = r.round === selected;
        const body = (
          <>
            {active ? (
              <View style={styles.activeDot} />
            ) : r.closed ? (
              <Feather name="check" size={18} color={colors.accent} />
            ) : future ? (
              <Feather name="lock" size={16} color={colors.textSecondary} />
            ) : null}
            <Text style={[styles.chipText, active && { color: colors.textOnAccent, fontFamily: fonts.displayItalic }]}>
              Fecha {r.round}
            </Text>
          </>
        );
        return (
          <Pressable key={r.round} onPress={() => onPick(r.round)} accessibilityRole="button" accessibilityState={{ selected: isSelected }}>
            {active ? (
              <LinearGradient
                colors={[colors.accentGradientTop, colors.accentGradientBottom]}
                style={[styles.chip, shadows.glowAccent, isSelected && styles.chipSelectedRing]}
              >
                {body}
              </LinearGradient>
            ) : (
              <View style={[styles.chip, future && styles.chipFuture, isSelected && styles.chipSelected]}>{body}</View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MatchCard({ match, mine }: { match: Fixture; mine: boolean }) {
  const router = useRouter();
  const variant = match.status === 'DISPUTED' ? 'danger' : mine ? 'highlight' : 'default';
  const showScore = match.homeScore !== null && match.awayScore !== null;
  const homeWins = showScore && (match.homeScore as number) > (match.awayScore as number);
  const awayWins = showScore && (match.awayScore as number) > (match.homeScore as number);
  return (
    <Card variant={variant} style={styles.match}>
      <View style={styles.matchTop}>
        <MatchStatusBadge status={match.status} />
        {mine ? <Text style={styles.mineTag}>TU PARTIDO</Text> : null}
      </View>
      <View style={styles.matchRow}>
        <View style={[styles.team, styles.teamHome]}>
          <ClubCrest crestUrl={match.home.crestUrl} name={match.home.name} size={42} />
          <Text style={styles.teamName} numberOfLines={2}>
            {match.home.name}
          </Text>
        </View>
        {showScore ? (
          <View style={styles.score}>
            <ScoreBox value={match.homeScore as number} lead={homeWins} />
            <ScoreBox value={match.awayScore as number} lead={awayWins} />
          </View>
        ) : (
          <Text style={styles.vs}>VS</Text>
        )}
        <View style={[styles.team, styles.teamAway]}>
          <Text style={[styles.teamName, styles.teamNameAway]} numberOfLines={2}>
            {match.away.name}
          </Text>
          <ClubCrest crestUrl={match.away.crestUrl} name={match.away.name} size={42} />
        </View>
      </View>
      {mine && canEnterRoom(match.status) ? (
        <Button label="Entrar a la sala" icon="log-in" onPress={() => router.push(`/match/${match.id}`)} />
      ) : null}
    </Card>
  );
}

const ScoreBox = ({ value, lead }: { value: number; lead: boolean }) => (
  <View style={styles.scoreBox}>
    <Text style={[styles.scoreDigit, lead && { color: colors.accent }]}>{value}</Text>
  </View>
);

function RestCard({ row }: { row: StandingRow }) {
  return (
    <Card variant="dashed" style={styles.rest}>
      <ClubCrest crestUrl={row.crestUrl} name={row.clubName} size={38} />
      <Text style={styles.restText}>
        <Text style={styles.restStrong}>Descansa: </Text>
        {row.clubName}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...type.titleScreen, fontSize: 36, color: colors.textPrimary, marginTop: 6, marginBottom: 16 },
  stack: { gap: 12 },
  chipScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { paddingHorizontal: 16, gap: 10, paddingVertical: 8 },
  chip: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipFuture: { borderStyle: 'dashed', borderColor: colors.borderDashed, backgroundColor: 'transparent' },
  chipSelected: { borderColor: colors.accent },
  chipSelectedRing: { borderWidth: 0 },
  chipText: { fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 24, color: colors.textPrimary },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textOnAccent },
  roundHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginVertical: 14 },
  roundTitle: { ...type.bodyStrong, fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, color: colors.textPrimary },
  roundState: { ...type.body, color: colors.textSecondary },
  match: { gap: 14 },
  matchTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mineTag: { ...type.eyebrow, color: colors.accent, letterSpacing: 2 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamHome: { justifyContent: 'flex-start' },
  teamAway: { justifyContent: 'flex-end' },
  teamName: { ...type.bodyStrong, fontFamily: fonts.bold, fontSize: 17, lineHeight: 20, color: colors.textPrimary, flexShrink: 1 },
  teamNameAway: { textAlign: 'right' },
  score: { flexDirection: 'row', gap: 8 },
  scoreBox: {
    width: 35,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDigit: { ...type.scoreDigitSmall, color: colors.textPrimary },
  vs: { ...type.titleCard, fontSize: 22, color: colors.textSecondary, minWidth: 78, textAlign: 'center' },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  restText: { ...type.body, fontSize: 18, color: colors.textSecondary, flex: 1 },
  restStrong: { fontFamily: fonts.bold, color: colors.textPrimary },
  legend: { marginTop: 16, gap: 12 },
  legendBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
