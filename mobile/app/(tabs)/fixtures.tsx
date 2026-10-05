import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { Fixture, StandingRow } from '@/api/types';
import { Button } from '@/components/Button';
import { Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Scorebug } from '@/components/Scorebug';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { canEnterRoom, isMine, restingIn, summarizeRounds, type RoundSummary } from '@/features/tournament/derive';
import { useFixtures, useStandings, useTournament } from '@/features/tournament/hooks';
import { clubColor, fontsV2, palette, typeV2 } from '@/theme';

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

  const myId = participation.data?.participant.id;
  const mine = selected && myId ? selected.matches.find((m) => isMine(m, myId)) : undefined;
  const others = selected ? selected.matches.filter((m) => m !== mine) : [];

  return (
    <Screen
      onRefresh={() => [...queries, standings, participation].forEach((q) => void q.refetch())}
      refreshing={refreshing}
    >
      <Text style={styles.title}>Calendario</Text>

      <QueryBoundary queries={queries} skeleton={<FixturesSkeleton />}>
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

            {mine && myId ? (
              <Animated.View entering={FadeInDown.duration(220)}>
                <MyMatch match={mine} myId={myId} />
              </Animated.View>
            ) : null}

            <View>
              {others.map((m, i) => (
                <Animated.View key={m.id} entering={i < 5 ? FadeInDown.duration(220).delay((i + 1) * 40) : undefined}>
                  <MatchRow match={m} />
                </Animated.View>
              ))}
              {restingIn(selected.matches, standings.data ?? []).map((row) => (
                <RestRow key={row.participantId} row={row} />
              ))}
            </View>
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
        const isCurrent = r.round === current;
        const future = r.round > current;
        const isSelected = r.round === selected;
        const fg = isSelected ? palette.ink : future ? palette.textSecondary : palette.paper;
        return (
          <Pressable
            key={r.round}
            onPress={() => onPick(r.round)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            {isCurrent ? (
              <View style={[styles.currentDot, { backgroundColor: isSelected ? palette.signalPressed : palette.signal }]} />
            ) : r.closed ? (
              <Feather name="check" size={16} color={isSelected ? palette.ink : palette.positive} />
            ) : future ? (
              <Feather name="lock" size={14} color={fg} />
            ) : null}
            <Text style={[styles.chipText, { color: fg }]}>Fecha {r.round}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function toTeam(team: Fixture['home'], score: number | null) {
  return { code: team.shortName, name: team.name, crestUrl: team.crestUrl, color: clubColor(team.shortName), score };
}

/** My own match first and bigger: a compact scorebug, its status and the room button. */
function MyMatch({ match, myId }: { match: Fixture; myId: string }) {
  const router = useRouter();
  const iAmHome = match.home.participantId === myId;
  return (
    <View style={styles.mine}>
      <Eyebrow tone={match.status === 'DISPUTED' ? 'danger' : undefined}>Tu partido</Eyebrow>
      <Scorebug
        variant="compact"
        mine={iAmHome ? 'home' : 'away'}
        home={toTeam(match.home, match.homeScore)}
        away={toTeam(match.away, match.awayScore)}
      />
      <MatchStatusBadge status={match.status} />
      {canEnterRoom(match.status) ? (
        <Button label="Entrar a la sala" icon="log-in" onPress={() => router.push(`/match/${match.id}`)} />
      ) : null}
    </View>
  );
}

function MatchRow({ match }: { match: Fixture }) {
  const showScore = match.homeScore !== null && match.awayScore !== null;
  const homeScore = match.homeScore as number;
  const awayScore = match.awayScore as number;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={
        showScore ? `${match.home.name} ${homeScore}, ${match.away.name} ${awayScore}` : `${match.home.name} contra ${match.away.name}`
      }
    >
      <View style={styles.rowMain}>
        <View style={[styles.team, styles.teamHome]}>
          <ClubCrest crestUrl={match.home.crestUrl} name={match.home.name} size={28} />
          <Text style={styles.code}>{match.home.shortName}</Text>
        </View>
        {showScore ? (
          <View style={styles.score}>
            <Text style={[styles.digit, homeScore < awayScore && styles.digitLoser]}>{homeScore}</Text>
            <Text style={styles.colon}>:</Text>
            <Text style={[styles.digit, awayScore < homeScore && styles.digitLoser]}>{awayScore}</Text>
          </View>
        ) : (
          <Text style={styles.vs}>VS</Text>
        )}
        <View style={[styles.team, styles.teamAway]}>
          <Text style={styles.code}>{match.away.shortName}</Text>
          <ClubCrest crestUrl={match.away.crestUrl} name={match.away.name} size={28} />
        </View>
      </View>
      <MatchStatusBadge status={match.status} compact />
    </View>
  );
}

function RestRow({ row }: { row: StandingRow }) {
  return (
    <View style={[styles.row, styles.rest]}>
      <ClubCrest crestUrl={row.crestUrl} name={row.clubName} size={28} />
      <Text style={styles.restText}>
        <Text style={styles.restStrong}>Descansa: </Text>
        {row.clubName}
      </Text>
    </View>
  );
}

/** Chip strip, round header, my match and two rows. */
function FixturesSkeleton() {
  return (
    <View style={styles.skStack}>
      <Skeleton height={40} />
      <Skeleton height={20} style={styles.skHeader} />
      <Skeleton height={56} />
      <Skeleton height={56} />
      <Skeleton height={56} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typeV2.titleScreen, color: palette.paper, marginBottom: 16 },
  chipScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: {
    height: 40,
    borderRadius: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.panel,
  },
  chipSelected: { backgroundColor: palette.paper },
  chipText: { fontFamily: fontsV2.display, fontSize: 18, lineHeight: 22, textTransform: 'uppercase' },
  currentDot: { width: 8, height: 8, borderRadius: 4 },
  roundHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  roundTitle: { ...typeV2.bodyStrong, color: palette.paper },
  roundState: { ...typeV2.caption, color: palette.textSecondary },
  mine: { gap: 12, marginBottom: 24 },
  row: { paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamHome: { justifyContent: 'flex-start' },
  teamAway: { justifyContent: 'flex-end' },
  code: { ...typeV2.rowCode, color: palette.paper },
  score: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 72 },
  digit: { ...typeV2.statBig, color: palette.paper, minWidth: 18, textAlign: 'center' },
  digitLoser: { color: palette.textSecondary },
  colon: { ...typeV2.statBig, color: palette.textSecondary },
  vs: { ...typeV2.label, color: palette.textSecondary, minWidth: 72, textAlign: 'center' },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  restText: { ...typeV2.body, color: palette.textSecondary, flex: 1 },
  restStrong: { ...typeV2.bodyStrong, color: palette.paper },
  skStack: { gap: 12 },
  skHeader: { width: 160 },
});
