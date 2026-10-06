import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { MatchDetail, MatchEvent } from '@/api/types';
import { BackHeader } from '@/components/BackHeader';
import { Button } from '@/components/Button';
import { Eyebrow } from '@/components/Card';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Scorebug } from '@/components/Scorebug';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { EventIcon } from '@/features/match/EventIcon';
import { EVENT_LABEL, mySide } from '@/features/match/derive';
import { detailScore, sortedEvents } from '@/features/match/detail';
import { useMatch } from '@/features/match/hooks';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { canEnterRoom } from '@/features/tournament/derive';
import { clubColor, fontsV2, palette, textOnFill, typeV2 } from '@/theme';

/** Read-only view of any match (live, finished or not started yet). The room (/match/[id]) is the only place that writes. */
export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useMatch(id);
  const participation = useMyParticipation();
  const refreshing = match.isFetching && !match.isPending;

  return (
    <Screen bottomInset onRefresh={() => void match.refetch()} refreshing={refreshing}>
      <BackHeader label="Volver" title="Partido" fallback="/fixtures" />
      <QueryBoundary queries={[match]} skeleton={<DetailSkeleton />}>
        {match.data ? <Detail match={match.data} myParticipantId={participation.data?.participant.id ?? null} /> : null}
      </QueryBoundary>
    </Screen>
  );
}

function statusNote(match: MatchDetail, side: 'home' | 'away' | null): string {
  switch (match.status) {
    case 'SCHEDULED':
      return 'Todavía no empieza: el administrador debe activar su fecha.';
    case 'ACTIVE':
      return 'Marcador en vivo: suma de los goles registrados hasta ahora.';
    case 'PENDING_CONFIRMATION':
      return side === 'away' ? 'El local registró el resultado: te toca confirmarlo o rechazarlo.' : 'Esperando que el visitante confirme el resultado.';
    case 'CONFIRMED':
      return 'Resultado confirmado.';
    case 'DISPUTED':
      return 'Resultado en disputa: el administrador fijará el marcador oficial.';
    case 'RESOLVED':
      return match.resolutionNote ? `Resuelto por el administrador. Nota: ${match.resolutionNote}` : 'Resuelto por el administrador.';
  }
}

function Detail({ match, myParticipantId }: { match: MatchDetail; myParticipantId: string | null }) {
  const router = useRouter();
  const side = myParticipantId ? mySide(match, myParticipantId) : null;
  const score = detailScore(match);
  const events = sortedEvents(match.events);
  const homeColor = clubColor(match.home.shortName);
  const awayColor = clubColor(match.away.shortName);

  return (
    <View style={styles.stack}>
      <View style={styles.meta}>
        <Eyebrow>
          Fecha {match.round} · {match.leg === 1 ? 'Ida' : 'Vuelta'}
        </Eyebrow>
        <MatchStatusBadge status={match.status} />
      </View>

      <Scorebug
        variant="hero"
        mine={side}
        home={{ code: match.home.shortName, name: match.home.name, crestUrl: match.home.crestUrl, color: homeColor, score: score.home }}
        away={{ code: match.away.shortName, name: match.away.name, crestUrl: match.away.crestUrl, color: awayColor, score: score.away }}
      />
      <View style={styles.names}>
        <Text style={styles.teams}>
          {match.home.name} vs {match.away.name}
        </Text>
        <Text style={styles.note}>{statusNote(match, side)}</Text>
      </View>

      {side && canEnterRoom(match.status) ? (
        <Button label="Entrar a la sala" icon="log-in" onPress={() => router.push(`/match/${match.id}`)} />
      ) : null}

      <View style={styles.timelineHeader}>
        <Eyebrow>Eventos</Eyebrow>
        <Text style={styles.count}>
          {events.length} {events.length === 1 ? 'evento' : 'eventos'}
        </Text>
      </View>
      {events.length === 0 ? (
        <EmptyState
          title={match.status === 'SCHEDULED' ? 'Aún no empieza' : 'Sin eventos'}
          message={match.status === 'SCHEDULED' ? 'Los goles y las tarjetas aparecerán aquí cuando se juegue.' : 'Nadie ha registrado goles ni tarjetas en este partido.'}
        />
      ) : (
        <View>
          {events.map((e, i) => {
            const isHome = e.participantId === match.home.participantId;
            return (
              <Animated.View key={e.id} entering={i < 6 ? FadeInDown.duration(220).delay(i * 40) : undefined}>
                <TimelineRow event={e} home={isHome} color={isHome ? homeColor : awayColor} />
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Home events on the left, away events on the right, the minute on the axis in the colour of the club that did it. */
function TimelineRow({ event, home, color }: { event: MatchEvent; home: boolean; color: string }) {
  const line = (
    <View style={[styles.eventLine, home ? styles.eventLeft : styles.eventRight]}>
      {home ? null : <EventIcon type={event.type} size={22} />}
      <Text style={[styles.player, home && styles.playerLeft]} numberOfLines={2}>
        {event.playerName ?? 'Jugador'}
      </Text>
      {home ? <EventIcon type={event.type} size={22} /> : null}
    </View>
  );
  return (
    <View style={styles.row} accessible accessibilityLabel={`Minuto ${event.minute}, ${EVENT_LABEL[event.type].title}, ${event.playerName ?? 'jugador'}`}>
      <View style={styles.half}>{home ? line : null}</View>
      <View style={styles.axis}>
        <View style={styles.axisLine} />
        <View style={[styles.minute, { backgroundColor: color }]}>
          <Text style={[styles.minuteText, { color: textOnFill(color) }]}>{event.minute}&apos;</Text>
        </View>
      </View>
      <View style={styles.half}>{home ? null : line}</View>
    </View>
  );
}

/** Same silhouette as the loaded screen: status line, scorebug, names and a few timeline rows. */
function DetailSkeleton() {
  return (
    <View style={styles.stack}>
      <Skeleton height={20} style={styles.skMeta} />
      <Skeleton height={96} />
      <Skeleton height={40} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  names: { gap: 4, alignItems: 'center' },
  teams: { ...typeV2.bodyStrong, color: palette.paper, textAlign: 'center' },
  note: { ...typeV2.caption, color: palette.textSecondary, textAlign: 'center' },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  count: { ...typeV2.caption, color: palette.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  half: { flex: 1 },
  axis: { width: 56, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  axisLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: palette.line },
  minute: { minWidth: 40, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  minuteText: { fontFamily: fontsV2.display, fontSize: 18, lineHeight: 22 },
  eventLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  eventLeft: { justifyContent: 'flex-end' },
  eventRight: { justifyContent: 'flex-start' },
  player: { ...typeV2.bodyStrong, color: palette.paper, flexShrink: 1 },
  playerLeft: { textAlign: 'right' },
  skMeta: { width: 160 },
});
