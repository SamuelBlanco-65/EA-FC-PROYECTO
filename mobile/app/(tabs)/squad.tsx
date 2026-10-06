import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { isApiError } from '@/api/errors';
import type { Player } from '@/api/types';
import { Button } from '@/components/Button';
import { ClubCrest, PlayerAvatar } from '@/components/ClubCrest';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { EmptyState, Skeleton } from '@/components/StateViews';
import { useMySquad } from '@/features/match/hooks';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { groupSquad, playerSubtitle } from '@/features/squad/groups';
import { PlayerCard } from '@/features/squad/PlayerCard';
import { fontsV2, palette, typeV2 } from '@/theme';

/** My club's players, grouped by line. Read-only: the lineup is edited on the tactics board. */
export default function Squad() {
  const router = useRouter();
  const participation = useMyParticipation();
  const squad = useMySquad();
  const [selected, setSelected] = useState<Player | null>(null);
  const queries = [participation, squad];
  const refreshing = queries.some((q) => q.isFetching && !q.isPending);
  const notPlaying = isApiError(participation.error) && participation.error.code === 'NOT_A_PARTICIPANT';

  const club = participation.data?.club;
  const players = squad.data ?? [];

  return (
    <Screen onRefresh={() => queries.forEach((q) => void q.refetch())} refreshing={refreshing}>
      {notPlaying ? (
        <>
          <Text style={styles.title}>Plantilla</Text>
          <EmptyState title="No juegas en este torneo" message="Solo los participantes tienen una plantilla." />
        </>
      ) : (
        <>
          <View style={styles.header}>
            {club ? <ClubCrest crestUrl={club.crestUrl} name={club.name} size={56} /> : null}
            <View style={styles.headerText}>
              <Text style={styles.caption} numberOfLines={1}>
                {club ? `${club.name} · ` : ''}
                {players.length} {players.length === 1 ? 'jugador' : 'jugadores'}
              </Text>
              <Text style={styles.title}>Plantilla</Text>
            </View>
          </View>

          <QueryBoundary queries={queries} skeleton={<SquadSkeleton />}>
            {players.length === 0 ? (
              <EmptyState title="Plantilla vacía" message="Tu club no tiene jugadores cargados. Es un problema de datos, no tuyo." />
            ) : (
              <>
                <Button label="Pizarra táctica" variant="secondary" icon="target" onPress={() => router.push('/tactics')} style={styles.board} />
                {groupSquad(players).map((group) => (
                  <View key={group.key} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupTitle}>{group.title}</Text>
                      <Text style={styles.groupCount}>{group.players.length}</Text>
                    </View>
                    {group.players.map((p, i) => (
                      <Animated.View key={p.id} entering={i < 5 ? FadeInDown.duration(220).delay(i * 40) : undefined}>
                        <PlayerRow player={p} onPress={() => setSelected(p)} />
                      </Animated.View>
                    ))}
                  </View>
                ))}
              </>
            )}
          </QueryBoundary>
        </>
      )}
      <PlayerCard player={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function PlayerRow({ player, onPress }: { player: Player; onPress: () => void }) {
  const top = (player.overallRating ?? 0) >= 85;
  const subtitle = playerSubtitle(player);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityLabel={`${player.shirtNumber ?? ''} ${player.name}, ${player.position}${player.overallRating !== null ? `, valoración ${player.overallRating}` : ''}. Ver tarjeta`}
    >
      <PlayerAvatar photoUrl={player.photoUrl} name={player.name} size={44} />
      <Text style={styles.shirt}>{player.shirtNumber ?? '–'}</Text>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {player.position.toUpperCase()}
          {subtitle ? ` · ${subtitle}` : ''}
        </Text>
      </View>
      <View style={[styles.overall, top && styles.overallTop]}>
        <Text style={[styles.overallText, top && { color: palette.ink }]}>{player.overallRating ?? '–'}</Text>
      </View>
    </Pressable>
  );
}

/** Header-less silhouette: a few group labels and rows. */
function SquadSkeleton() {
  return (
    <View style={styles.skStack}>
      <Skeleton height={52} />
      <Skeleton height={16} style={styles.skLabel} />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={60} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  headerText: { flex: 1, gap: 2 },
  caption: { ...typeV2.caption, color: palette.textSecondary },
  title: { ...typeV2.titleScreen, color: palette.paper },
  board: { marginBottom: 8 },
  group: { marginTop: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  groupTitle: { ...typeV2.label, color: palette.textSecondary },
  groupCount: { ...typeV2.caption, color: palette.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
  },
  rowPressed: { backgroundColor: palette.panelRaised, borderColor: palette.signalBorder },
  shirt: { fontFamily: fontsV2.display, fontSize: 24, lineHeight: 26, color: palette.textSecondary, width: 30, textAlign: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...typeV2.bodyStrong, color: palette.paper },
  sub: { ...typeV2.caption, color: palette.textSecondary },
  overall: { minWidth: 44, height: 32, borderRadius: 4, backgroundColor: palette.panelRaised, borderWidth: 1, borderColor: palette.lineStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  overallTop: { backgroundColor: palette.cardYellow, borderColor: palette.cardYellow },
  overallText: { fontFamily: fontsV2.display, fontSize: 22, lineHeight: 24, color: palette.paper },
  skStack: { gap: 12 },
  skLabel: { width: 120 },
});
