import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { StandingRow } from '@/api/types';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { formatDifference, summarizeRounds } from '@/features/tournament/derive';
import { useFixtures, useStandings, useTournament } from '@/features/tournament/hooks';
import { useConnectionStore } from '@/stores/connectionStore';
import { colors, fonts, type } from '@/theme';

const COLUMNS = [
  { key: 'played', label: 'PJ' },
  { key: 'won', label: 'PG' },
  { key: 'drawn', label: 'PE' },
  { key: 'lost', label: 'PP' },
  { key: 'goalsFor', label: 'GF' },
  { key: 'goalsAgainst', label: 'GC' },
] as const;

export default function Standings() {
  const participation = useMyParticipation();
  const standings = useStandings();
  const tournament = useTournament();
  const fixtures = useFixtures();
  const live = useConnectionStore((s) => s.online !== false && s.socket === 'authenticated');
  const queries = [standings, tournament, fixtures];
  const refreshing = queries.some((q) => q.isFetching && !q.isPending);

  const rows = standings.data ?? [];
  const totalRounds = fixtures.data ? summarizeRounds(fixtures.data).length : 0;
  const eyebrow =
    tournament.data && totalRounds > 0
      ? `Fecha ${tournament.data.currentRound} de ${totalRounds} · ${rows.length} clubes`
      : `Sin iniciar · ${rows.length} clubes`;

  return (
    <Screen glow="blue" onRefresh={() => [...queries, participation].forEach((q) => void q.refetch())} refreshing={refreshing}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text style={styles.title}>Tabla de posiciones</Text>
      <View style={[styles.live, !live && styles.liveOff]}>
        <View style={[styles.liveDot, { backgroundColor: live ? colors.accent : colors.textSecondary }]} />
        <Text style={[styles.liveText, { color: live ? colors.accent : colors.textSecondary }]}>
          {live ? 'Actualizado en tiempo real' : 'Datos guardados'}
        </Text>
      </View>

      <QueryBoundary
        queries={queries}
        skeleton={
          <View style={styles.stack}>
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} height={56} />
            ))}
          </View>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon="list" title="Aún no hay clubes" message="Cuando los jugadores se inscriban aparecerán aquí." />
        ) : (
          <>
            <Card variant="raised" style={styles.table}>
              <Header />
              <View style={styles.rows}>
                {rows.map((row) => (
                  <Row key={row.participantId} row={row} mine={row.participantId === participation.data?.participant.id} />
                ))}
              </View>
            </Card>

            <Card style={styles.info}>
              <Feather name="info" size={24} color={colors.info} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>Criterio de desempate</Text>
                <Text style={styles.infoBody}>1. Puntos · 2. Diferencia de goles · 3. Goles a favor</Text>
                <Text style={styles.infoMuted}>Solo cuentan los partidos confirmados o resueltos.</Text>
              </View>
            </Card>
            <Text style={styles.legend}>
              PJ jugados · PG ganados · PE empatados · PP perdidos · GF goles a favor · GC goles en contra · DG diferencia · PTS
              puntos.
            </Text>
          </>
        )}
      </QueryBoundary>
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.headerRow}>
      <Text style={[styles.head, styles.colPos]}>#</Text>
      <Text style={[styles.head, styles.colClub]}>Club</Text>
      {COLUMNS.map((c) => (
        <Text key={c.key} style={[styles.head, styles.colNum]}>
          {c.label}
        </Text>
      ))}
      <Text style={[styles.head, styles.colNum]}>DG</Text>
      <Text style={[styles.head, styles.colPts, { color: colors.textPrimary }]}>PTS</Text>
    </View>
  );
}

function Row({ row, mine }: { row: StandingRow; mine: boolean }) {
  const dgColor = row.goalDifference > 0 ? colors.accent : row.goalDifference < 0 ? colors.danger : colors.textSecondary;
  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <Text style={[styles.cell, styles.colPos, styles.pos, mine && { color: colors.accent }]}>{row.position}</Text>
      <View style={[styles.colClub, styles.club]}>
        <ClubCrest crestUrl={row.crestUrl} name={row.clubName} size={30} />
        <View style={styles.clubNames}>
          <Text style={[styles.cell, styles.clubName]} numberOfLines={1} ellipsizeMode="tail">
            {row.clubName}
          </Text>
          {mine ? <Text style={styles.mine}>TU CLUB</Text> : null}
        </View>
      </View>
      {COLUMNS.map((c) => (
        <Text key={c.key} style={[styles.cell, styles.colNum]}>
          {row[c.key]}
        </Text>
      ))}
      <Text style={[styles.cell, styles.colNum, { color: dgColor }]}>{formatDifference(row.goalDifference)}</Text>
      <Text style={[styles.cell, styles.colPts, styles.pts, mine && { color: colors.accent }]}>{row.points}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.titleScreen, fontSize: 36, color: colors.textPrimary, marginTop: 6 },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  liveOff: { borderColor: colors.border, backgroundColor: colors.surface },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  liveText: { ...type.bodyStrong, fontFamily: fonts.bold },
  stack: { gap: 8 },
  table: { padding: 8 },
  rows: { gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 },
  head: { ...type.eyebrow, letterSpacing: 0.5, color: colors.textSecondary, textAlign: 'center' },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rowMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cell: { ...type.tableCell, color: colors.textPrimary, textAlign: 'center' },
  colPos: { width: 22 },
  colClub: { flex: 1, minWidth: 0, marginLeft: 6, textAlign: 'left' },
  colNum: { width: 26 },
  colPts: { width: 36 },
  pos: { ...type.statValue, fontSize: 20, lineHeight: 22, color: colors.textSecondary },
  pts: { fontSize: 20, lineHeight: 22 },
  club: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clubNames: { flex: 1, minWidth: 0 },
  clubName: { textAlign: 'left', fontSize: 15, lineHeight: 18 },
  mine: { ...type.eyebrow, fontSize: 10, lineHeight: 12, letterSpacing: 1.2, color: colors.accent },
  info: { flexDirection: 'row', gap: 14, marginTop: 12, alignItems: 'flex-start' },
  infoText: { flex: 1, gap: 4 },
  infoTitle: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.textPrimary },
  infoBody: { ...type.body, color: colors.textPrimary },
  infoMuted: { ...type.caption, color: colors.textSecondary },
  legend: { ...type.caption, color: colors.textSecondary, marginTop: 12, lineHeight: 20 },
});
