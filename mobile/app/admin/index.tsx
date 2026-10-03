import { Feather } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import type { AdminParticipant, Fixture, Tournament } from '@/api/types';
import { BackHeader } from '@/components/BackHeader';
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
import { colors, fonts, type } from '@/theme';

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
    <Screen glow="blue" bottomInset onRefresh={() => queries.forEach((q) => void q.refetch())} refreshing={refreshing}>
      <BackHeader label="Perfil" title="Administración" fallback="/profile" />
      <QueryBoundary
        queries={queries}
        skeleton={
          <View style={styles.stack}>
            <Skeleton height={150} />
            <Skeleton height={70} />
            <Skeleton height={160} />
          </View>
        }
      >
        {tournament.data && matches.data && participants.data ? (
          <View style={styles.stack}>
            <StatusCard tournament={tournament.data} overview={roundOverview(matches.data, tournament.data.currentRound)} />
            <Actions tournament={tournament.data} overview={roundOverview(matches.data, tournament.data.currentRound)} />
            <WorkQueue matches={matches.data} />
            <Participants participants={participants.data} max={tournament.data.maxParticipants} />
          </View>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}

function StatusCard({ tournament, overview }: { tournament: Tournament; overview: RoundOverview }) {
  return (
    <Card variant="raised" style={styles.status}>
      <View style={styles.row}>
        <Eyebrow tone="info">Estado del torneo</Eyebrow>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{STATUS_LABEL[tournament.status]}</Text>
        </View>
      </View>
      <Text style={styles.tournamentName} numberOfLines={2}>
        {tournament.name}
      </Text>
      <View style={styles.facts}>
        <Fact label="Inscritos" value={`${tournament.participantCount}/${tournament.maxParticipants}`} />
        <Fact
          label="Fecha activa"
          value={tournament.status === 'DRAFT' ? '-' : overview.totalRounds ? `${tournament.currentRound}/${overview.totalRounds}` : '-'}
        />
        <Fact
          label="Cerrados"
          value={overview.currentTotal ? `${overview.currentClosed}/${overview.currentTotal}` : '-'}
          accent={overview.currentTotal > 0 && overview.currentClosed === overview.currentTotal}
        />
      </View>
    </Card>
  );
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factValue, accent && { color: colors.accent }]}>{value}</Text>
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
          <Feather name="alert-triangle" size={20} color={colors.danger} />
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
      <Eyebrow tone="danger">Partidos pendientes y disputas ({queue.length})</Eyebrow>
      {queue.length === 0 ? (
        <Card variant="dashed" style={styles.empty}>
          <Text style={styles.emptyText}>Nada que resolver por ahora.</Text>
        </Card>
      ) : (
        queue.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/admin/matches/${m.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => pressed && { opacity: 0.85 }}
          >
            <Card variant={m.status === 'DISPUTED' ? 'danger' : 'default'} style={styles.queueRow}>
              <View style={styles.row}>
                <Text style={styles.round}>Fecha {m.round}</Text>
                <MatchStatusBadge status={m.status} compact />
              </View>
              <View style={styles.versus}>
                <Team name={m.home.name} crestUrl={m.home.crestUrl} />
                <Text style={styles.vs}>
                  {m.homeScore !== null && m.awayScore !== null ? `${m.homeScore} - ${m.awayScore}` : 'VS'}
                </Text>
                <Team name={m.away.name} crestUrl={m.away.crestUrl} />
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </View>
  );
}

function Team({ name, crestUrl }: { name: string; crestUrl: string }) {
  return (
    <View style={styles.team}>
      <ClubCrest crestUrl={crestUrl} name={name} size={40} />
      <Text style={styles.teamName} numberOfLines={2}>
        {name}
      </Text>
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
        <Card variant="dashed" style={styles.empty}>
          <Text style={styles.emptyText}>Todavía no hay inscritos.</Text>
        </Card>
      ) : (
        participants.map((p) => (
          <Card key={p.id} style={styles.participant}>
            <ClubCrest crestUrl={p.club.crestUrl} name={p.club.name} size={44} />
            <View style={styles.participantText}>
              <Text style={styles.participantName} numberOfLines={1}>
                {p.displayName}
              </Text>
              <Text style={styles.participantClub} numberOfLines={1}>
                {p.club.name}
              </Text>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  section: { gap: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { gap: 12 },
  pill: { backgroundColor: colors.infoSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { ...type.badge, color: colors.infoText },
  tournamentName: { ...type.titleCard, color: colors.textPrimary },
  facts: { flexDirection: 'row', gap: 8 },
  fact: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  factValue: { ...type.statValue, fontSize: 26, lineHeight: 28, color: colors.textPrimary },
  factLabel: { ...type.caption, fontFamily: fonts.medium, color: colors.textSecondary },
  hint: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { ...type.bodyStrong, color: colors.danger, flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { ...type.body, color: colors.textSecondary },
  queueRow: { gap: 12 },
  round: { ...type.eyebrow, color: colors.textSecondary },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  team: { flex: 1, alignItems: 'center', gap: 6 },
  teamName: { ...type.caption, fontFamily: fonts.bold, color: colors.textPrimary, textAlign: 'center' },
  vs: { ...type.titleCard, color: colors.textPrimary, paddingHorizontal: 8 },
  participant: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  participantText: { flex: 1 },
  participantName: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.textPrimary },
  participantClub: { ...type.caption, color: colors.textSecondary },
});
