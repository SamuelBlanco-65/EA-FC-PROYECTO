import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EventType, Player } from '@/api/types';
import { Button } from '@/components/Button';
import { PlayerAvatar } from '@/components/ClubCrest';
import { fontsV2, palette, radius, typeV2 } from '@/theme';

import { EventIcon, EVENT_COLOR } from './EventIcon';
import { clampMinute, EVENT_LABEL, MAX_MINUTE, MIN_MINUTE, positionLabel, sortSquad } from './derive';

const TITLE: Record<EventType, string> = { GOAL: 'Registrar gol', YELLOW: 'Tarjeta amarilla', RED: 'Tarjeta roja' };

interface Props {
  type: EventType | null;
  clubName: string;
  squad: Player[] | undefined;
  squadLoading: boolean;
  /** Minute the picker starts at: the latest one already registered in the match. */
  startMinute: number;
  onClose: () => void;
  onSubmit: (event: { type: EventType; playerId: string; minute: number }) => Promise<void>;
}

export function EventModal({ type: kind, clubName, squad, squadLoading, startMinute, onClose, onSubmit }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [minuteText, setMinuteText] = useState(String(startMinute));
  const [saving, setSaving] = useState(false);

  // Each time the modal opens it starts clean, with the minute of the last event.
  useEffect(() => {
    if (kind) {
      setPlayerId(null);
      setMinuteText(String(startMinute));
      setSaving(false);
    }
    // startMinute is read only when the modal opens: later changes (an event arriving) must not move the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const sorted = useMemo(() => sortSquad(squad ?? []), [squad]);
  const minute = clampMinute(parseInt(minuteText, 10));
  const tone = kind ? EVENT_COLOR[kind] : palette.signal;

  const submit = async () => {
    if (!kind || !playerId || saving) return;
    setSaving(true);
    try {
      await onSubmit({ type: kind, playerId, minute });
    } finally {
      setSaving(false);
    }
  };

  const setMinute = (value: number) => setMinuteText(String(clampMinute(value)));

  return (
    <Modal
      visible={kind !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['landscape', 'portrait']}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        {kind ? (
          <View style={[styles.sheet, { height: Math.min(height - 16, 420), width: Math.min(width - 24, 760) }]}>
            <View style={styles.header}>
              <View style={[styles.badge, { backgroundColor: tone }]}>
                <EventIcon type={kind} size={24} color={palette.onSignal} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>{TITLE[kind]}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {clubName} · elige el jugador y el minuto
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Feather name="x" size={18} color={palette.paper} />
                <Text style={styles.closeText}>Cerrar</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              <View style={styles.playersCol}>
                <Text style={styles.sectionLabel}>Jugador de mi plantilla</Text>
                {squadLoading ? (
                  <ActivityIndicator color={palette.signal} style={styles.loader} />
                ) : sorted.length === 0 ? (
                  <Text style={styles.empty}>
                    No hay plantilla guardada en este teléfono. Conéctate para cargarla.
                  </Text>
                ) : (
                  <FlatList
                    data={sorted}
                    keyExtractor={(p) => p.id}
                    contentContainerStyle={styles.playerList}
                    renderItem={({ item }) => (
                      <PlayerRow player={item} selected={item.id === playerId} onPress={() => setPlayerId(item.id)} />
                    )}
                  />
                )}
              </View>

              <View style={styles.minuteCol}>
                <Text style={styles.sectionLabel}>Minuto</Text>
                <View style={styles.stepper}>
                  <StepButton icon="minus" onPress={() => setMinute(minute - 1)} disabled={minute <= MIN_MINUTE} label="Restar un minuto" />
                  <TextInput
                    value={minuteText}
                    onChangeText={(t) => setMinuteText(t.replace(/[^0-9]/g, '').slice(0, 3))}
                    onBlur={() => setMinute(minute)}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                    disableFullscreenUI
                    style={styles.minuteInput}
                    accessibilityLabel="Minuto del evento"
                  />
                  <StepButton icon="plus" onPress={() => setMinute(minute + 1)} disabled={minute >= MAX_MINUTE} label="Sumar un minuto" />
                </View>
                <View style={styles.chips}>
                  <Chip label="Último" active={minute === startMinute} onPress={() => setMinute(startMinute)} />
                  <Chip label="45'" active={minute === 45} onPress={() => setMinute(45)} />
                  <Chip label="90'" active={minute === 90} onPress={() => setMinute(90)} />
                </View>

                <Button
                  label={playerId ? `Registrar ${EVENT_LABEL[kind].singular}` : 'Elige un jugador'}
                  loading={saving}
                  disabled={!playerId}
                  onPress={() => void submit()}
                  style={styles.submit}
                />
                <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function PlayerRow({ player, selected, onPress }: { player: Player; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.player, selected && styles.playerSelected]}
    >
      {selected ? <View style={styles.playerBar} /> : null}
      <PlayerAvatar photoUrl={player.photoUrl} name={player.name} size={34} />
      <Text style={[styles.shirt, selected && { color: palette.paper }]}>{player.shirtNumber ?? '–'}</Text>
      <Text style={styles.playerName} numberOfLines={1}>
        {player.name}
      </Text>
      <Text style={styles.position}>{positionLabel(player.position)}</Text>
      {selected ? <Feather name="check" size={20} color={palette.paper} /> : <View style={{ width: 20 }} />}
    </Pressable>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
  label,
}: {
  icon: 'plus' | 'minus';
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.step, disabled && { opacity: 0.4 }]}
    >
      <Feather name={icon} size={22} color={palette.paper} />
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: palette.panelRaised,
    borderRadius: radius.modal,
    borderWidth: 1,
    borderColor: palette.signalBorder,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 46, height: 46, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { ...typeV2.titleClub, color: palette.paper },
  subtitle: { ...typeV2.caption, color: palette.textSecondary },
  close: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: palette.lineStrong,
  },
  closeText: { ...typeV2.bodyStrong, color: palette.paper },
  body: { flexDirection: 'row', gap: 14, flex: 1 },
  playersCol: { flex: 1.5, gap: 6 },
  minuteCol: { flex: 1, gap: 8 },
  sectionLabel: { ...typeV2.label, color: palette.textSecondary },
  loader: { marginTop: 24 },
  empty: { ...typeV2.body, color: palette.textSecondary, marginTop: 12 },
  playerList: { gap: 4, paddingBottom: 4 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: 4,
    paddingHorizontal: 8,
    backgroundColor: palette.panel,
  },
  playerSelected: { backgroundColor: palette.ink },
  playerBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: palette.paper },
  shirt: { fontFamily: fontsV2.display, fontSize: 22, lineHeight: 24, color: palette.textSecondary, width: 30, textAlign: 'center' },
  playerName: { ...typeV2.bodyStrong, color: palette.paper, flex: 1 },
  position: { ...typeV2.badge, color: palette.textSecondary, width: 34, textAlign: 'right' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.ink,
    borderRadius: radius.input,
    padding: 6,
  },
  step: { width: 52, height: 52, borderRadius: radius.button, backgroundColor: palette.panelRaised, alignItems: 'center', justifyContent: 'center' },
  minuteInput: { fontFamily: fontsV2.display, fontSize: 40, lineHeight: 46, color: palette.paper, minWidth: 70, textAlign: 'center', padding: 0 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.button,
    backgroundColor: palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: palette.paper },
  chipText: { ...typeV2.bodyStrong, color: palette.paper },
  submit: { marginTop: 4 },
  cancel: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { ...typeV2.bodyStrong, color: palette.paper },
});
