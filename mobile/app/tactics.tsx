import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { errorMessage } from '@/api/errors';
import type { Lineup, Player } from '@/api/types';
import { Button } from '@/components/Button';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/StateViews';
import { useMySquad } from '@/features/match/hooks';
import { FORMATIONS, formationById } from '@/features/tactics/formations';
import { FpsMeter } from '@/features/tactics/FpsMeter';
import { useMyLineup, useSaveLineup } from '@/features/tactics/hooks';
import { buildSlots, type BoardSlot, signature, toPositions } from '@/features/tactics/lineup';
import { Pitch } from '@/features/tactics/Pitch';
import { PlayerToken } from '@/features/tactics/PlayerToken';
import { useConnectionStore } from '@/stores/connectionStore';
import { metrics, palette, radius, typeV2 } from '@/theme';

export default function Tactics() {
  const router = useRouter();
  const squad = useMySquad();
  const lineup = useMyLineup();

  return (
    <Screen scroll={false} bottomInset>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityRole="button">
          <Feather name="chevron-left" size={26} color={palette.paper} />
          <Text style={styles.backText}>Plantilla</Text>
        </Pressable>
        <Text style={styles.title}>Pizarra táctica</Text>
      </View>
      <View style={styles.body}>
        <QueryBoundary queries={[squad, lineup]} skeleton={<Skeleton height={420} />}>
          {squad.data && lineup.data !== undefined ? <Board squad={squad.data} saved={lineup.data} /> : null}
        </QueryBoundary>
      </View>
    </Screen>
  );
}

interface BoardProps {
  squad: Player[];
  saved: Lineup | null;
}

function Board({ squad, saved }: BoardProps) {
  const online = useConnectionStore((s) => s.online);
  const save = useSaveLineup();

  const [formationId, setFormationId] = useState(() => formationById(saved?.formation).id);
  const [slots, setSlots] = useState<BoardSlot[]>(() =>
    buildSlots(
      formationById(saved?.formation),
      squad,
      saved?.positions.map((p) => p.playerId),
      saved?.positions,
    ),
  );
  // What the server has (null = never saved). The button is enabled only when the board differs from it.
  const [baseline, setBaseline] = useState<string | null>(() =>
    saved ? signature(saved.formation, saved.positions) : null,
  );

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const fieldWidth = useSharedValue(0);
  const fieldHeight = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    fieldWidth.value = width;
    fieldHeight.value = height;
    setSize({ width, height });
  };

  const onMoved = useCallback((index: number, x: number, y: number) => {
    setSlots((current) => current.map((s, i) => (i === index ? { ...s, x, y } : s)));
  }, []);

  const pickFormation = (id: string) => {
    if (id === formationId) return;
    setFormationId(id);
    setSlots((current) =>
      buildSlots(formationById(id), squad, current.map((s) => s.player.id)),
    );
  };

  const current = signature(formationId, toPositions(slots));
  const dirty = current !== baseline;
  const offline = online === false;

  const onSave = () => {
    const sent = current;
    save.mutate(
      { formation: formationId, positions: toPositions(slots) },
      { onSuccess: () => setBaseline(sent) },
    );
  };

  const label = save.isPending ? 'Guardando…' : offline && dirty ? 'Sin conexión' : dirty ? 'Guardar alineación' : 'Alineación guardada';

  return (
    <View style={styles.board}>
      <View style={styles.tabs}>
        {FORMATIONS.map((f) => {
          const active = f.id === formationId;
          return (
            <Pressable
              key={f.id}
              onPress={() => pickFormation(f.id)}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{f.id}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.field} onLayout={onLayout}>
        {size ? (
          <>
            <Pitch width={size.width} height={size.height} />
            {slots.map((slot, i) => (
              <PlayerToken
                key={slot.player.id}
                slot={slot}
                index={i}
                fieldWidth={fieldWidth}
                fieldHeight={fieldHeight}
                onMoved={onMoved}
              />
            ))}
            {__DEV__ ? <FpsMeter /> : null}
          </>
        ) : null}
      </View>

      {slots.length < 11 ? (
        <Text style={styles.warning}>Tu plantilla solo tiene {squad.length} jugadores: la alineación queda incompleta.</Text>
      ) : null}
      {save.isError ? <Text style={styles.error}>{errorMessage(save.error)}</Text> : null}

      <View style={styles.footer}>
        <Text style={styles.hint}>Mantén pulsada una ficha y arrástrala para moverla.</Text>
        <Button
          label={label}
          icon={dirty ? 'save' : 'check'}
          onPress={onSave}
          loading={save.isPending}
          disabled={!dirty || offline || slots.length === 0}
          style={styles.save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: metrics.screenPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { ...typeV2.bodyStrong, color: palette.paper },
  title: { ...typeV2.titleClub, color: palette.paper },
  body: { flex: 1, paddingHorizontal: metrics.screenPadding, paddingTop: 12 },
  board: { flex: 1, gap: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, height: 44, borderRadius: radius.button, backgroundColor: palette.panel, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: palette.paper },
  tabText: { ...typeV2.button, color: palette.textSecondary },
  tabTextActive: { color: palette.ink },
  field: { flex: 1, borderRadius: radius.panel },
  warning: { ...typeV2.caption, color: palette.cardYellow },
  error: { ...typeV2.caption, color: palette.dangerText },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  hint: { ...typeV2.caption, flex: 1, color: palette.textSecondary },
  save: { flex: 1.4 },
});
