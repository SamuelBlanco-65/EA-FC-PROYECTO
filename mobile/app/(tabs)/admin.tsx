import { Feather } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import type { AdminParticipant, Fixture, Tournament } from '@/api/types';
import { Button } from '@/components/Button';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/StateViews';
import { needsAction, roundOverview, type RoundOverview } from '@/features/admin/derive';
import {
  useActivateNextRound,
  useAdminMatches,
  useAdminParticipants,
  useStartTournament,
} from '@/features/admin/hooks';
import { useTournament } from '@/features/tournament/hooks';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { palette, typeV2 } from '@/theme';

const STATUS_LABEL = { DRAFT: 'En inscripción', ACTIVE: 'En curso', FINISHED: 'Finalizado' } as const;

export default function Admin() {
  const role = useSessionStore((s) => s.user?.role);
  // Cosmetic guard: the server rejects every /admin call from a non-admin with 403 anyway.
  if (role !== 'admin') return <Redirect href="/home" />;
  return <AdminScreen />;
}

function AdminScreen() {
  const tournament = useTournament();
  const matches = useAdminMatches();
  const participants = useAdminParticipants();
  const queries = [tournament, matches, participants];
  const refreshing = queries.some((q) => q.isFetching && !q.isPending);

  return (
    <Screen bottomInset onRefresh={() => queries.forEach((q) => void q.refetch())} refreshing={refreshing}>
      <Text style={styles.title}>Administración</Text>
      <QueryBoundary
        queries={queries}
        skeleton={
          <View style={styles.stack}>
            <Skeleton height={20} style={styles.skName} />
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </View>
        }
      >
        {tournament.data && matches.data && participants.data ? (
          <View style={styles.stack}>
            <Status tournament={tournament.data} overview={roundOverview(matches.data, tournament.data.currentRound)} />
            <Actions tournament={tournament.data} overview={roundOverview(matches.data, tournament.data.currentRound)} />
            <WorkQueue matches={matches.data} />
            <Participants participants={participants.data} max={tournament.data.maxParticipants} />
          </View>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}

/** Tournament state as plain text and three figures on one line, no tiles. */
function Status({ tournament, overview }: { tournament: Tournament; overview: RoundOverview }) {
  const allClosed = overview.currentTotal > 0 && overview.currentClosed === overview.currentTotal;
  return (
    <View style={styles.status}>
      <Text style={styles.stateLabel}>{STATUS_LABEL[tournament.status]}</Text>
      <Text style={styles.tournamentName} numberOfLines={2}>
        {tournament.name}
      </Text>
      <View style={styles.facts}>
        <Fact label="Inscritos" value={`${tournament.participantCount}/${tournament.maxParticipants}`} />
        <Fact
          label="Fecha activa"
          value={tournament.status === 'DRAFT' ? '-' : overview.totalRounds ? `${tournament.currentRound}/${overview.totalRounds}` : '-'}
        />
        <Fact label="Cerrados" value={overview.currentTotal ? `${overview.currentClosed}/${overview.currentTotal}` : '-'} good={allClosed} />
      </View>
    </View>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={[typeV2.statBig, { color: good ? palette.positive : palette.paper }]}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

function Actions({ tournament, overview }: { tournament: Tournament; overview: RoundOverview }) {
  const online = useConnectionStore((s) => s.online);
  const start = useStartTournament();
  const activate = useActivateNextRound();
  const offline = online === false;
  const error = start.error ?? activate.error;

  const confirm = (title: string, message: string, run: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: run },
    ]);

  const roundOpen = overview.currentTotal > 0 && overview.currentClosed < overview.currentTotal;
  const noMoreRounds = overview.totalRounds > 0 && tournament.currentRound >= overview.totalRounds;

  return (
    <View style={styles.stack}>
      {error ? (
        <Card variant="danger" style={styles.errorCard}>
          <Feather name="alert-triangle" size={20} color={palette.dangerText} />
          <Text style={styles.errorText}>{errorMessage(error)}</Text>
        </Card>
      ) : null}

      {tournament.status === 'DRAFT' ? (
        <>
          <Button
            label="Iniciar torneo"
            icon="play"
            loading={start.isPending}
            disabled={offline}
            onPress={() => {
              activate.reset();
              confirm(
                'Iniciar torneo',
                `Se cierra la inscripción y se genera el calendario con ${tournament.participantCount} participantes. No se puede deshacer.`,
                () => start.mutate(),
              );
            }}
          />
          <Text style={styles.hint}>Se necesitan al menos 2 inscritos. Al iniciar, la inscripción se cierra.</Text>
        </>
      ) : null}

      {tournament.status === 'ACTIVE' ? (
        <>
          <Button
            label={tournament.currentRound === 0 ? 'Activar fecha 1' : 'Activar siguiente fecha'}
            icon="skip-forward"
            loading={activate.isPending}
            disabled={offline || roundOpen || noMoreRounds}
            onPress={() => {
              start.reset();
              confirm('Activar fecha', 'Los partidos de la siguiente fecha pasarán a "En juego".', () => activate.mutate());
            }}
          />
          <Text style={styles.hint}>
            {noMoreRounds
              ? 'No quedan fechas por activar.'
              : roundOpen
                ? `Faltan ${overview.currentTotal - overview.currentClosed} partido(s) de la fecha ${tournament.currentRound} por confirmar o resolver.`
                : 'La fecha actual está cerrada: puedes activar la siguiente.'}
          </Text>
        </>
      ) : null}
      {offline ? <Text style={styles.hint}>Sin conexión: las acciones de administración solo funcionan en línea.</Text> : null}
    </View>
  );
}

function WorkQueue({ matches }: { matches: Fixture[] }) {
  const router = useRouter();
  const queue = needsAction(matches);
  return (
    <View style={styles.section}>
      <Eyebrow tone={queue.length > 0 ? 'danger' : undefined}>Partidos pendientes y disputas ({queue.length})</Eyebrow>
      {queue.length === 0 ? (
        <Text style={styles.emptyText}>Nada que resolver por ahora.</Text>
      ) : (
        <View>
          {queue.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => router.push(`/admin/matches/${m.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.queueRow, pressed && styles.queuePressed]}
            >
              {m.status === 'DISPUTED' ? <View style={styles.disputeBar} /> : null}
              <View style={styles.row}>
                <Text style={styles.round}>Fecha {m.round}</Text>
                <MatchStatusBadge status={m.status} compact />
              </View>
              <View style={styles.versus}>
                <View style={[styles.team, styles.teamHome]}>
                  <ClubCrest crestUrl={m.home.crestUrl} name={m.home.name} size={28} />
                  <Text style={styles.code}>{m.home.shortName}</Text>
                </View>
                <Text style={styles.score}>
                  {m.homeScore !== null && m.awayScore !== null ? `${m.homeScore} : ${m.awayScore}` : 'VS'}
                </Text>
                <View style={[styles.team, styles.teamAway]}>
                  <Text style={styles.code}>{m.away.shortName}</Text>
                  <ClubCrest crestUrl={m.away.crestUrl} name={m.away.name} size={28} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Participants({ participants, max }: { participants: AdminParticipant[]; max: number }) {
  return (
    <View style={styles.section}>
      <Eyebrow>
        Participantes ({participants.length}/{max})
      </Eyebrow>
      {participants.length === 0 ? (
        <Text style={styles.emptyText}>Todavía no hay inscritos.</Text>
      ) : (
        <View>
          {participants.map((p) => (
            <View key={p.id} style={styles.participant}>
              <ClubCrest crestUrl={p.club.crestUrl} name={p.club.name} size={36} />
              <View style={styles.participantText}>
                <Text style={styles.participantName} numberOfLines={1}>
                  {p.displayName}
                </Text>
                <Text style={styles.participantClub} numberOfLines={1}>
                  {p.club.name}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typeV2.titleScreen, color: palette.paper, marginBottom: 16 },
  stack: { gap: 16 },
  section: { gap: 8, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  skName: { width: 200 },
  status: { gap: 8 },
  stateLabel: { ...typeV2.label, color: palette.textSecondary },
  tournamentName: { ...typeV2.titleClub, color: palette.paper },
  facts: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line, paddingVertical: 12 },
  fact: { flex: 1, gap: 2 },
  factLabel: { ...typeV2.caption, color: palette.textSecondary },
  hint: { ...typeV2.caption, color: palette.textSecondary, textAlign: 'center' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20 },
  errorText: { ...typeV2.bodyStrong, color: palette.dangerText, flex: 1 },
  emptyText: { ...typeV2.body, color: palette.textSecondary },
  queueRow: { paddingVertical: 12, paddingLeft: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  queuePressed: { backgroundColor: palette.panel },
  disputeBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: palette.cardRed },
  round: { ...typeV2.label, color: palette.textSecondary },
  versus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamHome: { justifyContent: 'flex-start' },
  teamAway: { justifyContent: 'flex-end' },
  code: { ...typeV2.rowCode, color: palette.paper },
  score: { ...typeV2.statBig, color: palette.paper, minWidth: 72, textAlign: 'center' },
  participant: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.line },
  participantText: { flex: 1 },
  participantName: { ...typeV2.bodyStrong, color: palette.paper },
  participantClub: { ...typeV2.caption, color: palette.textSecondary },
});
