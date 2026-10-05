import { Feather } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/errors';
import type { EventType, MatchDetail } from '@/api/types';
import { Button } from '@/components/Button';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Scorebug } from '@/components/Scorebug';
import { Skeleton } from '@/components/StateViews';
import { EventModal } from '@/features/match/EventModal';
import { EventsPanel } from '@/features/match/EventsPanel';
import { ResultModal } from '@/features/match/ResultModal';
import { MyTeamPanel, OpponentPanel } from '@/features/match/TeamPanels';
import { lastMinute, liveScore, mergeEvents, mySide, tally } from '@/features/match/derive';
import { useMatch, useMatchAction, useMySquad } from '@/features/match/hooks';
import { useLandscapeLock } from '@/features/match/useLandscapeLock';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { tapLight } from '@/haptics';
import { eventQueue, flushQueue, useQueueStore } from '@/offline/queue';
import { useConnectionStore } from '@/stores/connectionStore';
import { clubColor, palette, typeV2 } from '@/theme';

export default function MatchRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useLandscapeLock();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const match = useMatch(id);
  const participation = useMyParticipation();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <QueryBoundary
        queries={[match, participation]}
        skeleton={
          <View style={[styles.loading, { paddingHorizontal: insets.left + 16 }]}>
            <Skeleton height={60} />
            <Skeleton height={140} />
          </View>
        }
      >
        {match.data && participation.data ? (
          <Room match={match.data} myParticipantId={participation.data.participant.id} onLeave={leave} />
        ) : null}
      </QueryBoundary>
      {/* The query states above can hide the way out; this one is always reachable. */}
      {!match.data ? (
        <Pressable onPress={leave} style={[styles.floatingLeave, { left: insets.left + 12 }]} accessibilityRole="button">
          <Feather name="chevron-left" size={22} color={palette.paper} />
          <Text style={styles.leaveText}>Salir</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Room({ match, myParticipantId, onLeave }: { match: MatchDetail; myParticipantId: string; onLeave: () => void }) {
  const insets = useSafeAreaInsets();
  const online = useConnectionStore((s) => s.online);
  const socket = useConnectionStore((s) => s.socket);
  const pending = useQueueStore((s) => s.pending);
  const rejected = useQueueStore((s) => s.rejected);
  const squad = useMySquad();

  const [picking, setPicking] = useState<EventType | null>(null);
  const finish = useMatchAction(match.id, 'finish');
  const confirm = useMatchAction(match.id, 'confirm');
  const reject = useMatchAction(match.id, 'reject');

  const side = mySide(match, myParticipantId);
  const offline = online === false;
  const events = useMemo(
    () => mergeEvents(match.events, pending, rejected, match.id, squad.data ?? []),
    [match.events, match.id, pending, rejected, squad.data],
  );

  if (!side) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>No juegas en este partido</Text>
        <Pressable onPress={onLeave} style={styles.centerButton} accessibilityRole="button">
          <Text style={styles.leaveText}>Salir</Text>
        </Pressable>
      </View>
    );
  }

  const mine = side === 'home' ? match.home : match.away;
  const other = side === 'home' ? match.away : match.home;
  const status = match.status;
  const active = status === 'ACTIVE';
  const live = liveScore(events, match);
  const official = match.homeScore !== null && match.awayScore !== null && status !== 'SCHEDULED' && status !== 'ACTIVE';
  const score = official ? { home: match.homeScore as number, away: match.awayScore as number } : live;
  const pendingCount = pending.length;
  // The header shows MY number on the left (same side as the "Tu equipo" panel), whatever my side is.
  const mineFirst = (home: number, away: number) => (side === 'home' ? { mine: home, theirs: away } : { mine: away, theirs: home });
  const shown = mineFirst(score.home, score.away);
  const finalPair = mineFirst(match.homeScore ?? 0, match.awayScore ?? 0);
  const finalText = `${finalPair.mine} - ${finalPair.theirs} (tú - rival)`;

  const submitEvent = async (e: { type: EventType; playerId: string; minute: number }) => {
    try {
      // Saved on the phone first (survives a crash or a closed app), then sent. Same path online and offline.
      await eventQueue.enqueue({
        id: randomUUID(),
        matchId: match.id,
        participantId: myParticipantId,
        playerId: e.playerId,
        type: e.type,
        minute: e.minute,
        createdAt: new Date().toISOString(),
      });
    } catch {
      Alert.alert('No se pudo guardar', 'El teléfono no pudo guardar el evento. Inténtalo de nuevo.');
      return;
    }
    setPicking(null);
    tapLight();
    void flushQueue();
  };

  const askFinish = () =>
    Alert.alert(
      'Finalizar partido',
      `El marcador se calculará con los goles registrados (${mineFirst(live.home, live.away).mine} - ${mineFirst(live.home, live.away).theirs}, tú - rival) y el visitante deberá confirmarlo. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => finish.mutate(undefined, { onError: (err) => Alert.alert('No se pudo finalizar', errorMessage(err)) }),
        },
      ],
    );

  const resultModalVisible = status === 'PENDING_CONFIRMATION' && side === 'away';
  const resultBusy = confirm.isPending ? 'confirm' : reject.isPending ? 'reject' : null;
  const resultError = confirm.error ?? reject.error;

  return (
    <View style={styles.room}>
      <ConnectionBar offline={offline} pendingCount={pendingCount} />
      <View style={[styles.header, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <Pressable onPress={onLeave} style={styles.leave} accessibilityRole="button" accessibilityLabel="Salir de la sala">
          <Feather name="chevron-left" size={22} color={palette.paper} />
          <Text style={styles.leaveText}>Salir</Text>
        </Pressable>
        <View style={styles.bug}>
          <Scorebug
            variant="compact"
            mine="home"
            home={{ code: mine.shortName, name: mine.name, crestUrl: mine.crestUrl, color: clubColor(mine.shortName), score: shown.mine }}
            away={{ code: other.shortName, name: other.name, crestUrl: other.crestUrl, color: clubColor(other.shortName), score: shown.theirs }}
          />
        </View>
        <View style={styles.meta}>
          <MatchStatusBadge status={status} compact />
          <Text style={styles.roleText}>
            Fecha {match.round} · {side === 'home' ? 'Local' : 'Visitante'}
          </Text>
        </View>
        <ConnectionIcon online={online} socket={socket} />
      </View>

      <View style={[styles.columns, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <View style={styles.colMine}>
          <MyTeamPanel team={mine} side={side} enabled={active} onPick={setPicking} />
        </View>
        <View style={styles.colCenter}>
          <EventsPanel
            events={events}
            myParticipantId={myParticipantId}
            myColor={clubColor(mine.shortName)}
            otherColor={clubColor(other.shortName)}
            onDismissRejected={(eventId) => void eventQueue.dismissRejected(eventId)}
          />
        </View>
        <View style={styles.colOther}>
          <OpponentPanel team={other} side={side === 'home' ? 'away' : 'home'} tally={tally(events, other.participantId)} />
        </View>
      </View>

      <View style={[styles.footer, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <Footer
          match={match}
          side={side}
          offline={offline}
          pendingCount={pendingCount}
          scoreText={finalText}
          finishing={finish.isPending}
          onFinish={askFinish}
        />
      </View>

      <EventModal
        type={picking}
        clubName={mine.name}
        squad={squad.data}
        squadLoading={squad.isPending && squad.fetchStatus !== 'paused'}
        startMinute={lastMinute(events)}
        onClose={() => setPicking(null)}
        onSubmit={submitEvent}
      />
      <ResultModal
        visible={resultModalVisible}
        home={match.home}
        away={match.away}
        homeScore={match.homeScore ?? 0}
        awayScore={match.awayScore ?? 0}
        busy={resultBusy}
        online={!offline}
        error={resultError ? errorMessage(resultError) : null}
        onConfirm={() => confirm.mutate()}
        onReject={() => reject.mutate()}
        onLeave={onLeave}
      />
    </View>
  );
}

function Footer({
  match,
  side,
  offline,
  pendingCount,
  scoreText: score,
  finishing,
  onFinish,
}: {
  match: MatchDetail;
  side: 'home' | 'away';
  offline: boolean;
  pendingCount: number;
  scoreText: string;
  finishing: boolean;
  onFinish: () => void;
}) {

  if (match.status === 'ACTIVE') {
    // The server decides who may finish; this only mirrors it so the button is not offered to the visitor.
    const isHome = side === 'home';
    const reason = !isHome
      ? 'Solo el local puede finalizar'
      : offline
        ? 'Requiere conexión'
        : pendingCount > 0
          ? `Enviando ${pendingCount} ${pendingCount === 1 ? 'evento pendiente' : 'eventos pendientes'}…`
          : 'El visitante confirmará el resultado';
    const blocked = !isHome || offline || pendingCount > 0;
    return (
      <>
        <Button
          label={finishing ? 'Finalizando…' : 'Finalizar partido'}
          icon={blocked ? 'lock' : 'flag'}
          variant="secondary"
          loading={finishing}
          disabled={blocked}
          onPress={onFinish}
          style={[styles.finish, !blocked && !finishing && styles.finishReady]}
        />
        <Text style={[styles.hint, (offline || pendingCount > 0) && isHome && { color: palette.cardYellow }]}>{reason}</Text>
      </>
    );
  }

  const text: Record<string, string> = {
    SCHEDULED: 'Este partido todavía no está activo: el administrador debe activar la fecha.',
    PENDING_CONFIRMATION:
      side === 'home' ? `Esperando que el visitante confirme el resultado (${score}).` : `Responde al resultado ${score}.`,
    CONFIRMED: `Resultado confirmado: ${score}.`,
    DISPUTED: 'Resultado en disputa: el administrador fijará el marcador oficial.',
    RESOLVED: `Resuelto por el administrador: ${score}.`,
  };
  return <Text style={styles.status}>{text[match.status]}</Text>;
}

function ConnectionBar({ offline, pendingCount }: { offline: boolean; pendingCount: number }) {
  if (!offline && pendingCount === 0) return null;
  const plural = pendingCount === 1 ? 'evento pendiente' : 'eventos pendientes';
  return (
    <View style={[styles.bar, offline ? styles.barOffline : styles.barSending]} accessibilityRole="alert">
      <Feather name={offline ? 'wifi-off' : 'upload-cloud'} size={16} color={offline ? palette.onSignal : palette.cardYellow} />
      <Text style={[styles.barText, !offline && { color: palette.cardYellow }]}>
        {offline
          ? pendingCount > 0
            ? `Sin conexión – ${pendingCount} ${plural} de enviar`
            : 'Sin conexión – los eventos se guardan en el teléfono y se envían al volver'
          : `Enviando ${pendingCount} ${plural}…`}
      </Text>
      {!offline ? (
        <Pressable onPress={() => void flushQueue()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.barRetry}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small icon, only when something is wrong: when all is well there is nothing to show. */
function ConnectionIcon({ online, socket }: { online: boolean | null; socket: string }) {
  const ok = online !== false && socket === 'authenticated';
  if (ok) return null;
  const off = online === false;
  return (
    <View accessible accessibilityLabel={off ? 'Sin conexión' : 'Conectando'}>
      <Feather name={off ? 'wifi-off' : 'wifi'} size={20} color={palette.cardYellow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ink },
  room: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerTitle: { ...typeV2.titleClub, color: palette.paper },
  centerButton: { height: 44, paddingHorizontal: 20, borderRadius: 6, borderWidth: 1, borderColor: palette.lineStrong, alignItems: 'center', justifyContent: 'center' },
  floatingLeave: { position: 'absolute', top: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12 },
  barOffline: { backgroundColor: palette.cardYellow },
  barSending: { backgroundColor: palette.panel },
  barText: { ...typeV2.badge, fontSize: 14, lineHeight: 18, color: palette.onSignal },
  barRetry: { ...typeV2.badge, color: palette.paper, textDecorationLine: 'underline' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 8 },
  leave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40 },
  leaveText: { ...typeV2.bodyStrong, color: palette.paper },
  bug: { flex: 1, maxWidth: 460 },
  meta: { gap: 4 },
  roleText: { ...typeV2.caption, color: palette.textSecondary },
  columns: { flex: 1, flexDirection: 'row', gap: 10 },
  colMine: { flex: 3 },
  colCenter: { flex: 3.4 },
  colOther: { flex: 1.6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 8, minHeight: 56 },
  finish: { paddingHorizontal: 24 },
  finishReady: { borderColor: palette.paper },
  hint: { ...typeV2.body, fontSize: 14, color: palette.textSecondary, flexShrink: 1 },
  status: { ...typeV2.bodyStrong, color: palette.paper, textAlign: 'center' },
});
