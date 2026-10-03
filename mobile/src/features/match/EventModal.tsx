import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EventType, Player } from '@/api/types';
import { PlayerAvatar } from '@/components/ClubCrest';
import { colors, fonts, radii, shadows, type } from '@/theme';

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
  const tone = kind ? EVENT_COLOR[kind] : colors.accent;

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
                <EventIcon type={kind} size={24} color={kind === 'GOAL' ? colors.textOnAccent : colors.textOnAccent} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>{TITLE[kind]}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {clubName} · elige el jugador y el minuto
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Feather name="x" size={18} color={colors.textPrimary} />
                <Text style={styles.closeText}>Cerrar</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              <View style={styles.playersCol}>
                <Text style={styles.sectionLabel}>Jugador de mi plantilla</Text>
                {squadLoading ? (
                  <ActivityIndicator color={colors.accent} style={styles.loader} />
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

                <Pressable
                  onPress={submit}
                  disabled={!playerId || saving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !playerId || saving, busy: saving }}
                  style={({ pressed }) => [styles.submitWrap, playerId && !saving && shadows.glowAccent, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={playerId ? (kind === 'GOAL' ? [colors.accentGradientTop, colors.accentGradientBottom] : [tone, tone]) : [colors.accentDisabled, colors.accentDisabled]}
                    style={styles.submit}
                  >
                    {saving ? (
                      <ActivityIndicator color={colors.textOnAccent} />
                    ) : (
                      <Text style={[type.button, { color: playerId ? colors.textOnAccent : 'rgba(242,244,255,0.8)' }]}>
                        {playerId ? `Registrar ${EVENT_LABEL[kind].singular}` : 'Elige un jugador'}
                      </Text>
                    )}
                  </LinearGradient>
                </Pressable>
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
      <PlayerAvatar photoUrl={player.photoUrl} name={player.name} size={34} />
      <Text style={[styles.shirt, selected && { color: colors.accent }]}>{player.shirtNumber ?? '–'}</Text>
      <Text style={styles.playerName} numberOfLines={1}>
        {player.name}
      </Text>
      <Text style={styles.position}>{positionLabel(player.position)}</Text>
      {selected ? <Feather name="check" size={20} color={colors.accent} /> : <View style={{ width: 20 }} />}
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
      <Feather name={icon} size={22} color={colors.textPrimary} />
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.modal,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { ...type.titleCard, fontSize: 24, lineHeight: 26, color: colors.textPrimary },
  subtitle: { ...type.body, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  close: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: { ...type.bodyStrong, fontSize: 14, color: colors.textPrimary },
  body: { flexDirection: 'row', gap: 14, flex: 1 },
  playersCol: { flex: 1.5, gap: 6 },
  minuteCol: { flex: 1, gap: 8 },
  sectionLabel: { ...type.eyebrow, color: colors.textSecondary },
  loader: { marginTop: 24 },
  empty: { ...type.body, fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  playerList: { gap: 4, paddingBottom: 4 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  playerSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  shirt: { fontFamily: fonts.displayItalic, fontSize: 22, lineHeight: 24, color: colors.textSecondary, width: 30, textAlign: 'center' },
  playerName: { ...type.bodyStrong, fontSize: 16, color: colors.textPrimary, flex: 1 },
  position: { ...type.badge, color: colors.textSecondary, width: 34, textAlign: 'right' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
  },
  step: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  minuteInput: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.textPrimary, minWidth: 70, textAlign: 'center', padding: 0 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { ...type.bodyStrong, fontSize: 15, color: colors.textPrimary },
  submitWrap: { borderRadius: radii.button, marginTop: 4 },
  submit: { height: 52, borderRadius: radii.button, alignItems: 'center', justifyContent: 'center' },
  cancel: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { ...type.bodyStrong, fontSize: 15, color: colors.textPrimary },
});
