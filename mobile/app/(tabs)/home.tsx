import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import type { Fixture, StandingRow, Tournament } from '@/api/types';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/StateViews';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { formatDifference, myNextMatch, myStanding, summarizeRounds } from '@/features/tournament/derive';
import { useFixtures, useStandings, useTournament } from '@/features/tournament/hooks';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, fonts, type } from '@/theme';

const TOURNAMENT_LABEL = { DRAFT: 'En inscripción', ACTIVE: 'En curso', FINISHED: 'Finalizado' } as const;

export default function Home() {
  const user = useSessionStore((s) => s.user);
  const participation = useMyParticipation();
  const tournament = useTournament();
  const standings = useStandings();
  const fixtures = useFixtures();
  const queries = [participation, tournament, standings, fixtures];
  const refreshing = queries.some((q) => q.isFetching && !q.isPending);

  const refresh = () => queries.forEach((q) => void q.refetch());
  const firstName = user?.displayName.split(/\s+/)[0] ?? '';

  return (
    <Screen glow="blue" onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.header}>
        <View style={styles.greetingRow}>
          <LinearGradient colors={[colors.accentGradientTop, colors.accentGradientBottom]} style={styles.mark}>
            <Text style={styles.markText}>FC</Text>
          </LinearGradient>
          <View style={styles.greetingText}>
            <Text style={styles.welcome}>Bienvenido de nuevo</Text>
            <Text style={styles.name} numberOfLines={1}>
              Hola, {firstName}
            </Text>
          </View>
        </View>
        <LivePill />
      </View>

      <QueryBoundary
        queries={queries}
        skeleton={
          <View style={styles.stack}>
            <Skeleton height={110} />
            <Skeleton height={230} />
            <Skeleton height={90} />
            <Skeleton height={120} />
          </View>
        }
      >
        {participation.data && tournament.data && standings.data && fixtures.data ? (
          <View style={styles.stack}>
            <ClubCard club={participation.data.club} />
            <NextMatchCard
              tournament={tournament.data}
              fixtures={fixtures.data}
              participantId={participation.data.participant.id}
            />
            <StatsRow row={myStanding(standings.data, participation.data.participant.id)} />
            <TournamentCard tournament={tournament.data} fixtures={fixtures.data} />
          </View>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}

function LivePill() {
  const online = useConnectionStore((s) => s.online);
  const socket = useConnectionStore((s) => s.socket);
  const live = online !== false && socket === 'authenticated';
  return (
    <View style={[styles.pill, live ? styles.pillLive : styles.pillOff]}>
      <View style={[styles.pillDot, { backgroundColor: live ? colors.accent : colors.warning }]} />
      <Text style={[styles.pillText, { color: live ? colors.accent : colors.warning }]}>
        {live ? 'En línea' : online === false ? 'Sin conexión' : 'Conectando'}
      </Text>
    </View>
  );
}

function ClubCard({ club }: { club: { name: string; league: string; country: string; crestUrl: string } }) {
  return (
    <Card variant="raised" style={styles.clubCard}>
      <ClubCrest crestUrl={club.crestUrl} name={club.name} size={64} />
      <View style={styles.clubText}>
        <Eyebrow>Mi club</Eyebrow>
        <Text style={styles.clubName} numberOfLines={2}>
          {club.name}
        </Text>
        <Text style={styles.clubMeta}>
          {club.league} · {club.country}
        </Text>
      </View>
    </Card>
  );
}

function NextMatchCard({
  tournament,
  fixtures,
  participantId,
}: {
  tournament: Tournament;
  fixtures: Fixture[];
  participantId: string;
}) {
  if (tournament.status === 'DRAFT') {
    return (
      <Card variant="dashed" style={styles.waiting}>
        <Feather name="clock" size={28} color={colors.textSecondary} />
        <Text style={styles.waitingTitle}>Esperando inicio</Text>
        <Text style={styles.waitingText}>
          {tournament.participantCount} de {tournament.maxParticipants} jugadores inscritos. El administrador iniciará el torneo.
        </Text>
      </Card>
    );
  }

  const match = myNextMatch(fixtures, participantId);
  if (!match) {
    return (
      <Card variant="dashed" style={styles.waiting}>
        <Feather name="flag" size={28} color={colors.textSecondary} />
        <Text style={styles.waitingTitle}>Sin partidos pendientes</Text>
        <Text style={styles.waitingText}>No tienes partidos por jugar por ahora.</Text>
      </Card>
    );
  }

  const iAmHome = match.home.participantId === participantId;
  const resting = match.round > tournament.currentRound;
  const showScore = match.homeScore !== null && match.awayScore !== null;
  return (
    <Card variant="raised" style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <Eyebrow>Próximo partido · Fecha {match.round}</Eyebrow>
        <MatchStatusBadge status={match.status} compact />
      </View>
      <View style={styles.versus}>
        <Side name={match.home.name} crestUrl={match.home.crestUrl} tag="Local" mine={iAmHome} />
        <View style={styles.score}>
          {showScore ? (
            <>
              <ScoreBox value={match.homeScore as number} />
              <ScoreBox value={match.awayScore as number} />
            </>
          ) : (
            <Text style={styles.vs}>VS</Text>
          )}
        </View>
        <Side name={match.away.name} crestUrl={match.away.crestUrl} tag="Visitante" mine={!iAmHome} />
      </View>
      {resting ? <Text style={styles.restNote}>Descansas en la fecha {tournament.currentRound}.</Text> : null}
    </Card>
  );
}

function Side({ name, crestUrl, tag, mine }: { name: string; crestUrl: string; tag: string; mine: boolean }) {
  return (
    <View style={styles.side}>
      <ClubCrest crestUrl={crestUrl} name={name} size={62} />
      <Text style={styles.sideName} numberOfLines={2}>
        {name}
      </Text>
      <View style={[styles.tag, mine && styles.tagMine]}>
        <Text style={[styles.tagText, mine && { color: colors.accent }]}>{tag}</Text>
      </View>
    </View>
  );
}

const ScoreBox = ({ value }: { value: number }) => (
  <View style={styles.scoreBox}>
    <Text style={styles.scoreDigit}>{value}</Text>
  </View>
);

function StatsRow({ row }: { row: StandingRow | null }) {
  const stats = [
    { label: 'Posición', value: row ? `#${row.position}` : '-', accent: true },
    { label: 'Puntos', value: row ? String(row.points) : '-' },
    { label: 'Jugados', value: row ? String(row.played) : '-' },
    { label: 'Dif. goles', value: row ? formatDifference(row.goalDifference) : '-' },
  ];
  return (
    <View style={styles.stats}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.stat, s.accent && styles.statAccent]}>
          <Text style={[styles.statValue, s.accent && { color: colors.accent }]}>{s.value}</Text>
          <Text style={styles.statLabel}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TournamentCard({ tournament, fixtures }: { tournament: Tournament; fixtures: Fixture[] }) {
  const rounds = summarizeRounds(fixtures);
  const completed = rounds.filter((r) => r.closed).length;
  return (
    <Card style={styles.tournament}>
      <View style={styles.matchHeader}>
        <Eyebrow tone="info">Estado del torneo</Eyebrow>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{TOURNAMENT_LABEL[tournament.status]}</Text>
        </View>
      </View>
      {rounds.length === 0 ? (
        <Text style={styles.roundTitle}>Sin iniciar</Text>
      ) : (
        <>
          <View style={styles.roundRow}>
            <Text style={styles.roundTitle}>
              Fecha {tournament.currentRound} <Text style={styles.roundOf}>de {rounds.length}</Text>
            </Text>
            <Text style={styles.completed}>{completed} completadas</Text>
          </View>
          <View style={styles.segments}>
            {rounds.map((r) => (
              <View
                key={r.round}
                style={[
                  styles.segment,
                  r.closed && styles.segmentDone,
                  !r.closed && r.round === tournament.currentRound && styles.segmentCurrent,
                ]}
              />
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  mark: { width: 46, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', transform: [{ skewX: '-10deg' }] },
  markText: { fontFamily: fonts.displayItalic, fontSize: 22, color: colors.textOnAccent },
  greetingText: { flex: 1 },
  welcome: { ...type.body, color: colors.textSecondary, fontSize: 15, lineHeight: 18 },
  name: { ...type.titleScreen, color: colors.textPrimary },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  pillLive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pillOff: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  pillDot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { ...type.bodyStrong, fontFamily: fonts.bold },
  stack: { gap: 12 },
  clubCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  clubText: { flex: 1, gap: 4 },
  clubName: { ...type.titleCard, color: colors.textPrimary },
  clubMeta: { ...type.body, color: colors.textSecondary },
  waiting: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  waitingTitle: { ...type.titleCard, color: colors.textPrimary },
  waitingText: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  matchCard: { gap: 16 },
  matchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  versus: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  side: { flex: 1, alignItems: 'center', gap: 8 },
  sideName: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.textPrimary, textAlign: 'center' },
  tag: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagMine: { backgroundColor: colors.accentSoft },
  tagText: { ...type.eyebrow, color: colors.textSecondary, letterSpacing: 1.5 },
  score: { flexDirection: 'row', gap: 8, alignItems: 'center', height: 62, paddingHorizontal: 8 },
  scoreBox: {
    width: 46,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDigit: { ...type.scoreDigit, color: colors.textPrimary },
  vs: { ...type.titleCard, color: colors.textSecondary },
  restNote: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statAccent: { borderColor: colors.accent, borderWidth: 1.5 },
  statValue: { ...type.statValue, color: colors.textPrimary },
  statLabel: { ...type.caption, fontFamily: fonts.medium, color: colors.textSecondary },
  tournament: { gap: 12 },
  statusPill: { backgroundColor: colors.infoSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  statusPillText: { ...type.badge, color: colors.infoText },
  roundRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  roundTitle: { ...type.titleHero, fontSize: 34, color: colors.textPrimary },
  roundOf: { color: colors.textSecondary },
  completed: { ...type.body, color: colors.textSecondary },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border },
  segmentDone: { backgroundColor: colors.accent },
  segmentCurrent: { backgroundColor: 'rgba(0,229,141,0.55)' },
});
