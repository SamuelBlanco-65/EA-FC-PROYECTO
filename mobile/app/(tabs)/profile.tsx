import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, Eyebrow } from '@/components/Card';
import { ClubCrest } from '@/components/ClubCrest';
import { Screen } from '@/components/Screen';
import { signOut } from '@/features/auth/useAuth';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, type } from '@/theme';

// Minimal on purpose: the full profile screen belongs to a later phase. Sign-out is needed now to switch accounts.
export default function Profile() {
  const user = useSessionStore((s) => s.user);
  const participation = useMyParticipation();
  const router = useRouter();

  return (
    <Screen glow="blue">
      <Eyebrow>Cuenta</Eyebrow>
      <Text style={styles.title}>Perfil</Text>
      <Card style={styles.card}>
        <Text style={styles.name}>{user?.displayName}</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <Text style={styles.meta}>{user?.role === 'admin' ? 'Administrador' : 'Participante'}</Text>
      </Card>
      {participation.data ? (
        <Card variant="raised" style={styles.club}>
          <ClubCrest crestUrl={participation.data.club.crestUrl} name={participation.data.club.name} size={64} />
          <View style={styles.clubText}>
            <Eyebrow>Mi club</Eyebrow>
            <Text style={styles.clubName}>{participation.data.club.name}</Text>
            <Text style={styles.meta}>
              {participation.data.club.league} · {participation.data.club.country}
            </Text>
          </View>
        </Card>
      ) : null}
      {participation.data ? (
        <View style={styles.tactics}>
          <Button label="Pizarra táctica" variant="secondary" icon="target" onPress={() => router.push('/tactics')} />
        </View>
      ) : null}
      {user?.role === 'admin' ? (
        <View style={styles.tactics}>
          <Button label="Administración" variant="secondary" icon="shield" onPress={() => router.push('/admin')} />
        </View>
      ) : null}
      <View style={styles.logout}>
        <Button label="Cerrar sesión" variant="dangerOutline" icon="log-out" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.titleScreen, fontSize: 36, color: colors.textPrimary, marginTop: 6, marginBottom: 16 },
  card: { gap: 6 },
  name: { ...type.titleCard, color: colors.textPrimary },
  meta: { ...type.body, color: colors.textSecondary },
  club: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  clubText: { flex: 1, gap: 4 },
  clubName: { ...type.titleCard, color: colors.textPrimary },
  tactics: { marginTop: 12 },
  logout: { marginTop: 24 },
});
