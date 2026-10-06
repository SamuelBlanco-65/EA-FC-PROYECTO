import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

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
import { clubColor, metrics, palette, radius, typeV2 } from '@/theme';

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
            {rows.map((row, i) => (
              <Animated.View key={row.participantId} entering={i < 6 ? FadeInDown.duration(220).delay(i * 40) : undefined}>
                <Row row={row} mine={row.participantId === participation.data?.participant.id} />
              </Animated.View>
            ))}
            <Legend />
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

const TIEBREAK = ['PTS', 'DG', 'GF'] as const;
const ABBREVIATIONS = [
  { code: 'PJ', text: 'Partidos jugados' },
  { code: 'GF', text: 'Goles a favor' },
  { code: 'DG', text: 'Diferencia de goles' },
  { code: 'PTS', text: 'Puntos' },
] as const;

function Legend() {
  return (
    <Card style={styles.legendCard}>
      <Eyebrow>Desempate</Eyebrow>
      <View style={styles.steps}>
        {TIEBREAK.map((code, i) => (
          <View key={code} style={styles.stepGroup}>
            {i > 0 ? <Feather name="chevron-right" size={16} color={palette.textTertiary} /> : null}
            <View style={styles.step}>
              <Text style={styles.stepIndex}>{i + 1}</Text>
              <Text style={styles.stepCode}>{code}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.legendNote}>Solo cuentan los partidos confirmados o resueltos.</Text>

      <View style={styles.divider} />

      <Eyebrow>Cómo leer la tabla</Eyebrow>
      <View style={styles.abbrGrid}>
        {ABBREVIATIONS.map((a) => (
          <View key={a.code} style={styles.abbr}>
            <Text style={styles.abbrCode}>{a.code}</Text>
            <Text style={styles.abbrText}>{a.text}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.legendNote}>Bajo el club: ganados-empatados-perdidos.</Text>
    </Card>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    backgroundColor: palette.panelRaised,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    borderBottomWidth: 2,
    borderBottomColor: palette.signalBorder,
  },
  head: { ...typeV2.tabLabel, color: palette.textSecondary, textAlign: 'center' },
  row: {
    height: metrics.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  rowMine: { backgroundColor: palette.signalSoft },
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
  legendCard: { marginTop: 20, gap: 10 },
  steps: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  stepGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radius.button,
    backgroundColor: palette.panelRaised,
    borderWidth: 1,
    borderColor: palette.lineStrong,
  },
  stepIndex: { ...typeV2.label, color: palette.signal },
  stepCode: { ...typeV2.bodyStrong, color: palette.paper },
  legendNote: { ...typeV2.caption, color: palette.textSecondary },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: 4 },
  abbrGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  abbr: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  abbrCode: { ...typeV2.bodyStrong, color: palette.signal, minWidth: 30 },
  abbrText: { ...typeV2.caption, color: palette.textSecondary, flex: 1 },
  skeletonRow: { height: metrics.rowHeight, flexDirection: 'row', alignItems: 'center', gap: 12 },
  skCrest: { width: 28 },
  skName: { flex: 1 },
  skNums: { width: 96 },
});
