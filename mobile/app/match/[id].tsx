import { Feather } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/errors';
import type { EventType, MatchDetail } from '@/api/types';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Skeleton } from '@/components/StateViews';
import { EventModal } from '@/features/match/EventModal';
import { EventsPanel } from '@/features/match/EventsPanel';
import { ResultModal } from '@/features/match/ResultModal';
import { MyTeamPanel, OpponentPanel } from '@/features/match/TeamPanels';
import { lastMinute, liveScore, mergeEvents, mySide, tally } from '@/features/match/derive';
import { useMatch, useMatchAction, useMySquad } from '@/features/match/hooks';
import { useLandscapeLock } from '@/features/match/useLandscapeLock';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { eventQueue, flushQueue, useQueueStore } from '@/offline/queue';
import { useConnectionStore } from '@/stores/connectionStore';
import { colors, fonts, radii, type } from '@/theme';

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
      <ScreenBackground glow="green" />
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
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
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
    void flushQueue();
  };

  const askFinish = () =>
    Alert.alert(
      'Finalizar partido',
      `El marcador se calculará con los goles registrados (${live.home} - ${live.away}) y el visitante deberá confirmarlo. No se puede deshacer.`,
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
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
          <Text style={styles.leaveText}>Salir</Text>
        </Pressable>
        <View style={styles.title}>
          <View style={styles.titleBar} />
          <Text style={styles.titleText} numberOfLines={2}>
            Fecha {match.round} · {match.home.shortName} vs {match.away.shortName}
          </Text>
        </View>
        {active ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>En vivo</Text>
          </View>
        ) : (
          <MatchStatusBadge status={status} compact />
        )}
        <View style={styles.score}>
          <ScoreBox value={score.home} />
          <Text style={styles.colon}>:</Text>
          <ScoreBox value={score.away} />
        </View>
        <ConnectionChip online={online} socket={socket} />
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{side === 'home' ? 'Eres el local' : 'Eres el visitante'}</Text>
        </View>
      </View>

      <View style={[styles.columns, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <View style={styles.colSide}>
          <MyTeamPanel team={mine} side={side} enabled={active} onPick={setPicking} />
        </View>
        <View style={styles.colCenter}>
          <EventsPanel
            events={events}
            myParticipantId={myParticipantId}
            onDismissRejected={(eventId) => void eventQueue.dismissRejected(eventId)}
          />
        </View>
        <View style={styles.colSide}>
          <OpponentPanel team={other} side={side === 'home' ? 'away' : 'home'} tally={tally(events, other.participantId)} />
        </View>
      </View>

      <View style={[styles.footer, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <Footer
          match={match}
          side={side}
          offline={offline}
          pendingCount={pendingCount}
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
  finishing,
  onFinish,
}: {
  match: MatchDetail;
  side: 'home' | 'away';
  offline: boolean;
  pendingCount: number;
  finishing: boolean;
  onFinish: () => void;
}) {
  const score = `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`;

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
        <Pressable
          onPress={onFinish}
          disabled={blocked || finishing}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked || finishing, busy: finishing }}
          style={({ pressed }) => [styles.finishWrap, pressed && { opacity: 0.85 }]}
        >
          {blocked ? (
            <View style={[styles.finish, styles.finishBlocked]}>
              <Feather name="lock" size={20} color={colors.textSecondary} />
              <Text style={[styles.finishText, { color: colors.textSecondary }]}>Finalizar partido</Text>
            </View>
          ) : (
            <LinearGradient colors={['#FFFFFF', '#E4E8F8']} style={styles.finish}>
              <Feather name="flag" size={20} color={colors.textOnAccent} />
              <Text style={[styles.finishText, { color: colors.textOnAccent }]}>{finishing ? 'Finalizando…' : 'Finalizar partido'}</Text>
            </LinearGradient>
          )}
        </Pressable>
        <Text style={[styles.hint, (offline || pendingCount > 0) && isHome && { color: colors.warning }]}>{reason}</Text>
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
      <Feather name={offline ? 'wifi-off' : 'upload-cloud'} size={16} color={offline ? colors.textOnAccent : colors.warning} />
      <Text style={[styles.barText, !offline && { color: colors.warning }]}>
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

function ConnectionChip({ online, socket }: { online: boolean | null; socket: string }) {
  const ok = online !== false && socket === 'authenticated';
  const off = online === false;
  const tone = ok ? colors.accent : colors.warning;
  return (
    <View style={[styles.chip, { borderColor: tone, backgroundColor: ok ? colors.accentSoft : colors.warningSoft }]}>
      <Feather name={off ? 'wifi-off' : 'wifi'} size={16} color={tone} />
      <Text style={[styles.chipText, { color: tone }]}>{ok ? 'Conectado' : off ? 'Sin conexión' : 'Conectando'}</Text>
    </View>
  );
}

const ScoreBox = ({ value }: { value: number }) => (
  <View style={styles.scoreBox}>
    <Text style={styles.scoreDigit}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  room: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerTitle: { ...type.titleCard, color: colors.textPrimary },
  centerButton: { height: 44, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  floatingLeave: { position: 'absolute', top: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12 },
  barOffline: { backgroundColor: colors.warning },
  barSending: { backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.warning },
  barText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.textOnAccent },
  barRetry: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPrimary, textDecorationLine: 'underline' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 8 },
  leave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40 },
  leaveText: { ...type.bodyStrong, color: colors.textPrimary },
  title: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleBar: { width: 16, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  titleText: { ...type.eyebrow, color: colors.textSecondary, flex: 1 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 34,
    transform: [{ skewX: '-8deg' }],
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textOnAccent },
  liveText: { fontFamily: fonts.displayItalic, fontSize: 18, lineHeight: 20, color: colors.textOnAccent, textTransform: 'uppercase', letterSpacing: 1 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colon: { ...type.scoreDigit, fontSize: 28, color: colors.textSecondary },
  scoreBox: {
    width: 44,
    height: 52,
    borderRadius: radii.digit,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDigit: { ...type.scoreDigit, fontSize: 36, lineHeight: 40, color: colors.textPrimary },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  chipText: { ...type.badge },
  rolePill: { height: 34, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  roleText: { ...type.bodyStrong, fontSize: 14 , color: colors.textPrimary },
  columns: { flex: 1, flexDirection: 'row', gap: 10 },
  colSide: { flex: 3 },
  colCenter: { flex: 3.4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 8, minHeight: 56 },
  finishWrap: { borderRadius: radii.button },
  finish: { height: 44, paddingHorizontal: 28, borderRadius: radii.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  finishBlocked: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  finishText: { fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 24, textTransform: 'uppercase' },
  hint: { ...type.body, fontSize: 14, color: colors.textSecondary, flexShrink: 1 },
  status: { ...type.bodyStrong, fontSize: 15, color: colors.textPrimary, textAlign: 'center' },
});
