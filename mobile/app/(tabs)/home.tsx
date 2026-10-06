import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { isApiError } from '@/api/errors';
import type { Fixture, StandingRow, Tournament } from '@/api/types';
import { Button } from '@/components/Button';
import { CountUp } from '@/components/CountUp';
import { Card, Eyebrow } from '@/components/Card';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Scorebug } from '@/components/Scorebug';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { canEnterRoom, formatDifference, myNextMatch, myStanding, seasonTrail, summarizeRounds } from '@/features/tournament/derive';
import { useFixtures, useStandings, useTournament } from '@/features/tournament/hooks';
import { SeasonTrail } from '@/features/tournament/SeasonTrail';
import { useSessionStore } from '@/stores/sessionStore';
import { clubColor, palette, typeV2 } from '@/theme';

const TOURNAMENT_LABEL = { DRAFT: 'En inscripción', ACTIVE: 'En curso', FINISHED: 'Finalizado' } as const;

export default function Home() {
  const user = useSessionStore((s) => s.user);
  const participation = useMyParticipation();
  const tournament = useTournament();
  const standings = useStandings();
  const fixtures = useFixtures();
  const queries = [participation, tournament, standings, fixtures];
  const refreshing = queries.some((q) => q.isFetching && !q.isPending);

  const router = useRouter();

  const refresh = () => queries.forEach((q) => void q.refetch());
  const firstName = user?.displayName.split(/\s+/)[0] ?? '';

  const adminNotPlaying =
    user?.role === 'admin' && isApiError(participation.error) && participation.error.code === 'NOT_A_PARTICIPANT';
  if (adminNotPlaying) {
    return (
      <Screen>
        <EmptyState title="Eres administrador" message="No juegas en este torneo. Gestiónalo desde Administración." />
        <Button label="Administración" icon="shield" onPress={() => router.push('/admin')} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text style={styles.greeting} numberOfLines={1}>
        Hola, {firstName}
      </Text>

      <QueryBoundary queries={queries} skeleton={<HomeSkeleton />}>
        {participation.data && tournament.data && standings.data && fixtures.data ? (
          <View style={styles.stack}>
            <Animated.View entering={FadeInDown.duration(220)}>
              <NextMatch tournament={tournament.data} fixtures={fixtures.data} participantId={participation.data.participant.id} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(220).delay(40)}>
              <StatsLine row={myStanding(standings.data, participation.data.participant.id)} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(220).delay(80)}>
              <RoundsBar tournament={tournament.data} fixtures={fixtures.data} participantId={participation.data.participant.id} />
            </Animated.View>
          </View>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}

function NextMatch({
  tournament,
  fixtures,
  participantId,
}: {
  tournament: Tournament;
  fixtures: Fixture[];
  participantId: string;
}) {
  const router = useRouter();
  if (tournament.status === 'DRAFT') {
    return (
      <EmptyState
        title="Esperando inicio"
        message={`${tournament.participantCount} de ${tournament.maxParticipants} jugadores inscritos. El administrador iniciará el torneo.`}
      />
    );
  }

  const match = myNextMatch(fixtures, participantId);
  if (!match) {
    return <EmptyState title="Sin partidos pendientes" message="No tienes partidos por jugar por ahora." />;
  }

  const iAmHome = match.home.participantId === participantId;
  const resting = match.round > tournament.currentRound;
  return (
    <View style={styles.hero}>
      <View style={styles.heroHeader}>
        <Eyebrow>Próximo partido · Fecha {match.round}</Eyebrow>
        <MatchStatusBadge status={match.status} compact />
      </View>
      <Pressable
        onPress={() => router.push(`/match-detail/${match.id}`)}
        accessibilityRole="button"
        accessibilityLabel="Ver detalle del partido"
      >
      <Scorebug
        variant="hero"
        mine={iAmHome ? 'home' : 'away'}
        home={{
          code: match.home.shortName,
          name: match.home.name,
          crestUrl: match.home.crestUrl,
          color: clubColor(match.home.shortName),
          score: match.homeScore,
        }}
        away={{
          code: match.away.shortName,
          name: match.away.name,
          crestUrl: match.away.crestUrl,
          color: clubColor(match.away.shortName),
          score: match.awayScore,
        }}
      />
      </Pressable>
      <View style={styles.heroNames}>
        <Text style={styles.heroTeams} numberOfLines={2}>
          {match.home.name} vs {match.away.name}
        </Text>
        <Text style={styles.heroNote}>
          {iAmHome ? 'Juegas de local' : 'Juegas de visitante'}
          {resting ? ` · Descansas en la fecha ${tournament.currentRound}` : ''}
        </Text>
      </View>
      {canEnterRoom(match.status) ? (
        <Button label="Entrar a la sala" icon="log-in" onPress={() => router.push(`/match/${match.id}`)} />
      ) : null}
    </View>
  );
}

function StatsLine({ row }: { row: StandingRow | null }) {
  const router = useRouter();
  const summary = row ? `${row.points} PTS · ${formatDifference(row.goalDifference)} DG` : 'Sin datos aún';
  return (
    <Pressable
      onPress={() => router.push('/standings')}
      style={({ pressed }) => [styles.stats, pressed && styles.statsPressed]}
      accessibilityRole="button"
      accessibilityLabel={row ? `Posición ${row.position}, ${summary}. Ver tabla` : 'Ver tabla'}
    >
      <Text style={[typeV2.statBig, styles.position]}>{row ? `#${row.position}` : '-'}</Text>
      <Text style={styles.statsText}>
        {row ? (
          <>
            <CountUp id="home-points" value={row.points} /> PTS · {formatDifference(row.goalDifference)} DG
          </>
        ) : (
          summary
        )}
      </Text>
      <Feather name="chevron-right" size={20} color={palette.textSecondary} />
    </Pressable>
  );
}

function RoundsBar({ tournament, fixtures, participantId }: { tournament: Tournament; fixtures: Fixture[]; participantId: string }) {
  const rounds = summarizeRounds(fixtures);
  const completed = rounds.filter((r) => r.closed).length;
  if (rounds.length === 0) {
    return <Text style={styles.roundsLabel}>Sin iniciar · {TOURNAMENT_LABEL[tournament.status]}</Text>;
  }
  return (
    <Card style={styles.rounds}>
      <View style={styles.roundsRow}>
        <Text style={styles.roundsLabel}>
          Fecha {tournament.currentRound} de {rounds.length} · {TOURNAMENT_LABEL[tournament.status]}
        </Text>
        <Text style={styles.completed}>{completed} completadas</Text>
      </View>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${Math.round((completed / rounds.length) * 100)}%` }]} />
      </View>
      <SeasonTrail steps={seasonTrail(fixtures, participantId, tournament.currentRound)} />
    </Card>
  );
}

/** Same silhouette as the loaded screen: hero label + scorebug + button, one stats line, one rounds bar. */
function HomeSkeleton() {
  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <Skeleton height={16} style={styles.skLabel} />
        <Skeleton height={96} />
        <Skeleton height={56} />
      </View>
      <Skeleton height={44} />
      <Skeleton height={130} />
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { ...typeV2.bodyStrong, color: palette.textSecondary, marginBottom: 16 },
  stack: { gap: 24 },
  hero: { gap: 12 },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroNames: { gap: 2, alignItems: 'center' },
  heroTeams: { ...typeV2.bodyStrong, color: palette.paper, textAlign: 'center' },
  heroNote: { ...typeV2.caption, color: palette.textSecondary, textAlign: 'center' },
  skLabel: { width: 180 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
  },
  statsPressed: { backgroundColor: palette.panelRaised, borderColor: palette.signalBorder },
  position: { color: palette.paper },
  statsText: { ...typeV2.data, color: palette.paper, flex: 1 },
  rounds: { gap: 12, paddingHorizontal: 12 },
  roundsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  roundsLabel: { ...typeV2.label, color: palette.paper },
  completed: { ...typeV2.caption, color: palette.textSecondary },
  progress: { height: 4, borderRadius: 2, backgroundColor: palette.ink, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.signal },
});
