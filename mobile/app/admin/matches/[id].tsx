import { Feather } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import type { MatchDetail } from '@/api/types';
import { BackHeader } from '@/components/BackHeader';
import { Button } from '@/components/Button';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/StateViews';
import { parseScore, recordedGoals } from '@/features/admin/derive';
import { useResolveMatch } from '@/features/admin/hooks';
import { useMatch } from '@/features/match/hooks';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, fonts, radii, type } from '@/theme';

const NOTE_MAX = 500;

export default function ResolveMatch() {
  const role = useSessionStore((s) => s.user?.role);
  const { id } = useLocalSearchParams<{ id: string }>();
  if (role !== 'admin') return <Redirect href="/home" />;
  return <Resolve id={id} />;
}

function Resolve({ id }: { id: string }) {
  const match = useMatch(id);
  return (
    <Screen glow="red" bottomInset>
      <BackHeader label="Administración" title="Resolver partido" fallback="/admin" />
      <QueryBoundary
        queries={[match]}
        skeleton={
          <View style={styles.stack}>
            <Skeleton height={160} />
            <Skeleton height={120} />
          </View>
        }
      >
        {match.data ? <Form key={match.data.id} match={match.data} /> : null}
      </QueryBoundary>
    </Screen>
  );
}

function Form({ match }: { match: MatchDetail }) {
  const online = useConnectionStore((s) => s.online);
  const resolve = useResolveMatch(match.id);
  const goals = recordedGoals(match);
  // The home player's reported score when there is one, else what the events add up to.
  const [home, setHome] = useState(String(match.homeScore ?? goals.home));
  const [away, setAway] = useState(String(match.awayScore ?? goals.away));
  const [note, setNote] = useState(match.resolutionNote ?? '');

  const resolvable = match.status === 'DISPUTED' || match.status === 'PENDING_CONFIRMATION';
  const homeScore = parseScore(home);
  const awayScore = parseScore(away);
  const valid = homeScore !== null && awayScore !== null;

  const submit = () => {
    if (homeScore === null || awayScore === null) return;
    Alert.alert(
      'Fijar marcador oficial',
      `${match.home.name} ${homeScore} - ${awayScore} ${match.away.name}. El partido pasa a Resuelto y entra en la tabla.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resolver',
          onPress: () => resolve.mutate({ homeScore, awayScore, note: note.trim() === '' ? null : note.trim() }),
        },
      ],
    );
  };

  const done = match.status === 'RESOLVED';

  return (
    <View style={styles.stack}>
      <Card variant={match.status === 'DISPUTED' ? 'danger' : 'raised'} style={styles.head}>
        <View style={styles.row}>
          <Eyebrow tone={match.status === 'DISPUTED' ? 'danger' : 'info'}>Fecha {match.round}</Eyebrow>
          <MatchStatusBadge status={match.status} />
        </View>
        <View style={styles.versus}>
          <Side name={match.home.name} crestUrl={match.home.crestUrl} tag="Local" />
          <Text style={styles.calc}>
            {goals.home} - {goals.away}
          </Text>
          <Side name={match.away.name} crestUrl={match.away.crestUrl} tag="Visitante" />
        </View>
        <Text style={styles.caption}>Marcador calculado con los goles registrados.</Text>
      </Card>

      <Card style={styles.claims}>
        <Claim
          icon="home"
          title="Local"
          text={
            match.homeScore !== null && match.awayScore !== null
              ? `Finalizó con ${match.homeScore} - ${match.awayScore}.`
              : 'Todavía no finalizó el partido.'
          }
        />
        <Claim
          icon={match.status === 'DISPUTED' ? 'x-circle' : 'clock'}
          title="Visitante"
          text={
            match.status === 'DISPUTED'
              ? 'Rechazó el resultado.'
              : match.status === 'PENDING_CONFIRMATION'
                ? 'Aún no responde.'
                : match.status === 'RESOLVED' || match.status === 'CONFIRMED'
                  ? 'El resultado quedó cerrado.'
                  : 'Sin respuesta todavía.'
          }
          danger={match.status === 'DISPUTED'}
        />
      </Card>

      {done ? (
        <Card variant="dashed" style={styles.empty}>
          <Text style={styles.resolvedTitle}>
            Resuelto: {match.homeScore} - {match.awayScore}
          </Text>
          {match.resolutionNote ? <Text style={styles.caption}>Nota: {match.resolutionNote}</Text> : null}
        </Card>
      ) : !resolvable ? (
        <Card variant="dashed" style={styles.empty}>
          <Text style={styles.caption}>Este partido aún no se puede resolver: el estado actual no lo permite.</Text>
        </Card>
      ) : (
        <>
          <Eyebrow>Marcador oficial</Eyebrow>
          <View style={styles.scoreRow}>
            <ScoreInput label={match.home.shortName} value={home} onChange={setHome} />
            <Text style={styles.dash}>-</Text>
            <ScoreInput label={match.away.shortName} value={away} onChange={setAway} />
          </View>
          {!valid ? <Text style={[styles.caption, { color: colors.danger }]}>Escribe un entero entre 0 y 99 en cada casilla.</Text> : null}

          <Eyebrow tone="info">Nota (opcional)</Eyebrow>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
            placeholder="Motivo de la decisión"
            placeholderTextColor={colors.textSecondary}
            selectionColor={colors.accent}
            multiline
            style={styles.note}
            accessibilityLabel="Nota"
          />
          <Text style={styles.counter}>
            {note.length}/{NOTE_MAX}
          </Text>

          {resolve.error ? (
            <Card variant="danger" style={styles.errorCard}>
              <Feather name="alert-triangle" size={20} color={colors.danger} />
              <Text style={styles.errorText}>{errorMessage(resolve.error)}</Text>
            </Card>
          ) : null}
          <Button
            label="Resolver"
            icon="check-circle"
            loading={resolve.isPending}
            disabled={!valid || online === false}
            onPress={submit}
          />
          {online === false ? <Text style={styles.caption}>Sin conexión: resolver solo funciona en línea.</Text> : null}
        </>
      )}
    </View>
  );
}

function Side({ name, crestUrl, tag }: { name: string; crestUrl: string; tag: string }) {
  return (
    <View style={styles.side}>
      <ClubCrest crestUrl={crestUrl} name={name} size={56} />
      <Text style={styles.sideName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.tag}>{tag}</Text>
    </View>
  );
}

function Claim({
  icon,
  title,
  text,
  danger,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  text: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.claim}>
      <Feather name={icon} size={20} color={danger ? colors.danger : colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.claimTitle}>{title}</Text>
        <Text style={[styles.caption, danger && { color: colors.danger }]}>{text}</Text>
      </View>
    </View>
  );
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.scoreCol}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 2))}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        selectionColor={colors.accent}
        style={styles.scoreInput}
        accessibilityLabel={`Goles de ${label}`}
      />
      <Text style={styles.scoreLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  head: { gap: 14 },
  versus: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  side: { flex: 1, alignItems: 'center', gap: 6 },
  sideName: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.textPrimary, textAlign: 'center' },
  tag: { ...type.eyebrow, color: colors.textSecondary },
  calc: { ...type.scoreDigit, color: colors.textPrimary, paddingHorizontal: 8, paddingTop: 10 },
  caption: { ...type.caption, color: colors.textSecondary },
  claims: { gap: 14 },
  claim: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  claimTitle: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.textPrimary },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  resolvedTitle: { ...type.titleCard, color: colors.textPrimary },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  scoreCol: { alignItems: 'center', gap: 6 },
  scoreInput: {
    ...type.scoreDigit,
    width: 84,
    height: 80,
    textAlign: 'center',
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreLabel: { ...type.caption, color: colors.textSecondary, maxWidth: 90 },
  dash: { ...type.scoreDigit, color: colors.textSecondary, marginBottom: 24 },
  note: {
    ...type.body,
    minHeight: 96,
    textAlignVertical: 'top',
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  counter: { ...type.caption, color: colors.textSecondary, textAlign: 'right' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { ...type.bodyStrong, color: colors.danger, flex: 1 },
});
