import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/errors';
import { ErrorState } from '@/components/StateViews';
import { Screen } from '@/components/Screen';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { useSessionStore } from '@/stores/sessionStore';
import { colors } from '@/theme';

/** Entry gate: signed out -> login; signed in -> home if I already have a club, otherwise the roulette. */
export default function Gate() {
  const status = useSessionStore((s) => s.status);
  const role = useSessionStore((s) => s.user?.role);
  const participation = useMyParticipation();

  if (status !== 'signedIn') return <Redirect href="/login" />;
  if (participation.data) return <Redirect href="/home" />;

  const error = participation.error;
  // 403 NOT_A_PARTICIPANT: not enrolled yet, which is the normal state before the roulette.
  // An admin who does not play has nothing to draw (and may find the enrolment closed): straight to the profile.
  if (isApiError(error) && error.code === 'NOT_A_PARTICIPANT') {
    return <Redirect href={role === 'admin' ? '/profile' : '/roulette'} />;
  }

  if (participation.isError) {
    const message = isApiError(error) ? error.message : 'No se pudo cargar tu información.';
    return (
      <Screen scroll={false} bottomInset>
        <ErrorState message={message} onRetry={() => void participation.refetch()} />
      </Screen>
    );
  }

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
