import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, Eyebrow } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { signOut } from '@/features/auth/useAuth';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, type } from '@/theme';

// Minimal on purpose: the full profile screen belongs to a later phase. Sign-out is needed now to switch accounts.
export default function Profile() {
  const user = useSessionStore((s) => s.user);
  const participation = useMyParticipation();

  return (
    <Screen glow="blue">
      <Eyebrow>Cuenta</Eyebrow>
      <Text style={styles.title}>Perfil</Text>
      <Card style={styles.card}>
        <Text style={styles.name}>{user?.displayName}</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <Text style={styles.meta}>{user?.role === 'admin' ? 'Administrador' : 'Participante'}</Text>
        {participation.data ? <Text style={styles.meta}>Club: {participation.data.club.name}</Text> : null}
      </Card>
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
  logout: { marginTop: 24 },
});
