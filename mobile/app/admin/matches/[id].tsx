import { Feather } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import type { MatchDetail } from '@/api/types';
import { BackHeader } from '@/components/BackHeader';
import { Button } from '@/components/Button';
import { Card, Eyebrow } from '@/components/Card';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { Scorebug } from '@/components/Scorebug';
import { Skeleton } from '@/components/StateViews';
import { parseScore, recordedGoals } from '@/features/admin/derive';
import { useResolveMatch } from '@/features/admin/hooks';
import { useMatch } from '@/features/match/hooks';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { clubColor, fontsV2, palette, radius, typeV2 } from '@/theme';

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
    <Screen bottomInset>
      <BackHeader label="Administración" title="Resolver partido" fallback="/admin" />
      <QueryBoundary
        queries={[match]}
        skeleton={
          <View style={styles.stack}>
            <Skeleton height={20} style={styles.skLabel} />
            <Skeleton height={56} />
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
      <View style={styles.head}>
        <View style={styles.row}>
          <Eyebrow tone={match.status === 'DISPUTED' ? 'danger' : undefined}>Fecha {match.round}</Eyebrow>
          <MatchStatusBadge status={match.status} />
        </View>
        <Scorebug
          variant="compact"
          home={{ code: match.home.shortName, name: match.home.name, crestUrl: match.home.crestUrl, color: clubColor(match.home.shortName), score: goals.home }}
          away={{ code: match.away.shortName, name: match.away.name, crestUrl: match.away.crestUrl, color: clubColor(match.away.shortName), score: goals.away }}
        />
        <Text style={styles.caption}>
          Local: {match.home.name} · Visitante: {match.away.name}. Marcador calculado con los goles registrados.
        </Text>
      </View>

      <View style={styles.claims}>
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
      </View>

      {done ? (
        <Card style={styles.empty}>
          <Text style={styles.resolvedTitle}>
            Resuelto: {match.homeScore} - {match.awayScore}
          </Text>
          {match.resolutionNote ? <Text style={styles.caption}>Nota: {match.resolutionNote}</Text> : null}
        </Card>
      ) : !resolvable ? (
        <Card style={styles.empty}>
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
          {!valid ? <Text style={[styles.caption, { color: palette.dangerText }]}>Escribe un entero entre 0 y 99 en cada casilla.</Text> : null}

          <Eyebrow>Nota (opcional)</Eyebrow>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
            placeholder="Motivo de la decisión"
            placeholderTextColor={palette.textTertiary}
            selectionColor={palette.signal}
            multiline
            style={styles.note}
            accessibilityLabel="Nota"
          />
          <Text style={styles.counter}>
            {note.length}/{NOTE_MAX}
          </Text>

          {resolve.error ? (
            <Card variant="danger" style={styles.errorCard}>
              <Feather name="alert-triangle" size={20} color={palette.dangerText} />
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
      <Feather name={icon} size={20} color={danger ? palette.dangerText : palette.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.claimTitle}>{title}</Text>
        <Text style={[styles.caption, danger && { color: palette.dangerText }]}>{text}</Text>
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
        selectionColor={palette.signal}
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
  stack: { gap: 16 },
  skLabel: { width: 160 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  head: { gap: 12 },
  caption: { ...typeV2.caption, color: palette.textSecondary },
  claims: { gap: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line },
  claim: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  claimTitle: { ...typeV2.bodyStrong, color: palette.paper },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  resolvedTitle: { ...typeV2.titleClub, color: palette.paper },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  scoreCol: { alignItems: 'center', gap: 6 },
  // Only colours differ between focused and not: no border width, shadow or elevation changes (Android focus bug).
  scoreInput: {
    fontFamily: fontsV2.display,
    fontSize: 48,
    lineHeight: 54,
    width: 84,
    height: 80,
    textAlign: 'center',
    color: palette.paper,
    backgroundColor: palette.panel,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: palette.line,
  },
  scoreLabel: { ...typeV2.caption, color: palette.textSecondary, maxWidth: 90 },
  dash: { fontFamily: fontsV2.display, fontSize: 48, color: palette.textSecondary, marginBottom: 24 },
  note: {
    ...typeV2.body,
    minHeight: 96,
    textAlignVertical: 'top',
    color: palette.paper,
    backgroundColor: palette.panel,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
  },
  counter: { ...typeV2.caption, color: palette.textSecondary, textAlign: 'right' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20 },
  errorText: { ...typeV2.bodyStrong, color: palette.dangerText, flex: 1 },
});
