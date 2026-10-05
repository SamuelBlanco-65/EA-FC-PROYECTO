import { StyleSheet, Text, View } from 'react-native';

import type { StandingRow } from '@/api/types';
import { ClubCrest } from '@/components/ClubCrest';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { formatDifference, summarizeRounds } from '@/features/tournament/derive';
import { useFixtures, useStandings, useTournament } from '@/features/tournament/hooks';
import { useConnectionStore } from '@/stores/connectionStore';
import { clubColor, metrics, palette, typeV2 } from '@/theme';

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
  const subtitle =
    tournament.data && totalRounds > 0
      ? `Fecha ${tournament.data.currentRound} de ${totalRounds} · ${rows.length} clubes`
      : `Sin iniciar · ${rows.length} clubes`;

  return (
    <Screen onRefresh={() => [...queries, participation].forEach((q) => void q.refetch())} refreshing={refreshing}>
      <Text style={styles.title}>Tabla de posiciones</Text>
      <View style={styles.subRow}>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.status} accessibilityLabel={live ? 'Actualizada en tiempo real' : 'Datos guardados'}>
          {live ? null : <Text style={styles.statusText}>Datos guardados</Text>}
          <View style={[styles.dot, { backgroundColor: live ? palette.textSecondary : palette.cardYellow }]} />
        </View>
      </View>

      <QueryBoundary queries={queries} skeleton={<TableSkeleton />}>
        {rows.length === 0 ? (
          <EmptyState title="Aún no hay clubes" message="Cuando los jugadores se inscriban aparecerán aquí." />
        ) : (
          <>
            <Header />
            {rows.map((row) => (
              <Row key={row.participantId} row={row} mine={row.participantId === participation.data?.participant.id} />
            ))}
            <Text style={styles.legend}>
              Desempate: PTS, DG y GF. Solo cuentan los partidos confirmados o resueltos.
            </Text>
            <Text style={styles.legend}>
              PJ jugados · GF goles a favor · DG diferencia de goles · PTS puntos. Bajo el club: ganados-empatados-perdidos.
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
      <Text style={[styles.head, styles.colClubHead]}>Club</Text>
      <Text style={[styles.head, styles.colPj]}>PJ</Text>
      <Text style={[styles.head, styles.colGf]}>GF</Text>
      <Text style={[styles.head, styles.colDg]}>DG</Text>
      <Text style={[styles.head, styles.colPts, { color: palette.paper }]}>PTS</Text>
    </View>
  );
}

function Row({ row, mine }: { row: StandingRow; mine: boolean }) {
  const dgColor = row.goalDifference > 0 ? palette.positive : row.goalDifference < 0 ? palette.dangerText : palette.textSecondary;
  const barColor = mine ? palette.paper : clubColor(row.clubShortName);
  return (
    <View
      style={[styles.row, mine && styles.rowMine]}
      accessible
      accessibilityLabel={`${row.position}. ${row.clubName}, ${row.points} puntos${mine ? ', tu club' : ''}`}
    >
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      <Text style={[typeV2.statBig, styles.colPos, { color: palette.paper }]}>{row.position}</Text>
      <ClubCrest crestUrl={row.crestUrl} name={row.clubName} size={28} />
      <View style={styles.clubText}>
        <Text style={[typeV2.rowCode, { color: palette.paper }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {row.clubShortName}
        </Text>
        <Text style={styles.record} numberOfLines={1} ellipsizeMode="tail">
          {row.won}-{row.drawn}-{row.lost} · {row.clubName}
        </Text>
      </View>
      <Text style={[typeV2.data, styles.num, styles.colPj]}>{row.played}</Text>
      <Text style={[typeV2.data, styles.num, styles.colGf]}>{row.goalsFor}</Text>
      <Text style={[typeV2.data, styles.num, styles.colDg, { color: dgColor }]}>{formatDifference(row.goalDifference)}</Text>
      <Text style={[typeV2.statBig, styles.num, styles.colPts]}>{row.points}</Text>
    </View>
  );
}

/** Same silhouette as a row: crest, code + caption, and the numbers. */
function TableSkeleton() {
  return (
    <View>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton height={28} style={styles.skCrest} />
          <Skeleton height={24} style={styles.skName} />
          <Skeleton height={24} style={styles.skNums} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typeV2.titleScreen, color: palette.paper },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 16 },
  subtitle: { ...typeV2.caption, color: palette.textSecondary },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { ...typeV2.caption, color: palette.cardYellow },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', height: 32, borderBottomWidth: 1, borderBottomColor: palette.line },
  head: { ...typeV2.tabLabel, color: palette.textSecondary, textAlign: 'center' },
  row: {
    height: metrics.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  rowMine: { backgroundColor: palette.panelRaised },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: metrics.clubBarWidth },
  colPos: { width: 36, paddingLeft: 8, textAlign: 'left' },
  colClubHead: { flex: 1, textAlign: 'left', paddingLeft: 36 },
  clubText: { flex: 1, minWidth: 0, marginLeft: 8 },
  record: { ...typeV2.caption, color: palette.textSecondary },
  num: { textAlign: 'center', color: palette.paper },
  colPj: { width: 28 },
  colGf: { width: 32 },
  colDg: { width: 38 },
  colPts: { width: 44 },
  legend: { ...typeV2.caption, color: palette.textSecondary, marginTop: 12 },
  skeletonRow: { height: metrics.rowHeight, flexDirection: 'row', alignItems: 'center', gap: 12 },
  skCrest: { width: 28 },
  skName: { flex: 1 },
  skNums: { width: 96 },
});
