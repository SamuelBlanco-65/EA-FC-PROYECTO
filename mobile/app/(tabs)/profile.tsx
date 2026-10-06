import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { initials, ClubCrest } from '@/components/ClubCrest';
import { Screen } from '@/components/Screen';
import { signOut } from '@/features/auth/useAuth';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { useSessionStore } from '@/stores/sessionStore';
import { palette, typeV2 } from '@/theme';

// Minimal on purpose: the full profile screen belongs to a later phase. Sign-out is needed now to switch accounts.
export default function Profile() {
  const user = useSessionStore((s) => s.user);
  const participation = useMyParticipation();
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.displayName ?? '?')}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.displayName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {user?.email}
          </Text>
          <Text style={styles.role}>{user?.role === 'admin' ? 'Administrador' : 'Participante'}</Text>
        </View>
      </View>

      {participation.data ? (
        <View style={styles.club}>
          <ClubCrest crestUrl={participation.data.club.crestUrl} name={participation.data.club.name} size={56} />
          <View style={styles.clubText}>
            <Text style={styles.label}>Mi club</Text>
            <Text style={styles.clubName} numberOfLines={2}>
              {participation.data.club.name}
            </Text>
            <Text style={styles.meta}>
              {participation.data.club.league} · {participation.data.club.country}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {user?.role === 'admin' ? (
          <Button label="Administración" variant="secondary" icon="shield" onPress={() => router.push('/admin')} />
        ) : null}
      </View>

      <View style={styles.logout}>
        <Button label="Cerrar sesión" variant="dangerOutline" icon="log-out" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typeV2.titleScreen, color: palette.paper, marginBottom: 24 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.panelRaised, borderWidth: 2, borderColor: palette.signal, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typeV2.statBig, color: palette.paper },
  identityText: { flex: 1, gap: 2 },
  name: { ...typeV2.titleClub, color: palette.paper },
  meta: { ...typeV2.caption, color: palette.textSecondary },
  role: { ...typeV2.label, color: palette.textSecondary, marginTop: 4 },
  club: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
  },
  clubText: { flex: 1, gap: 2 },
  label: { ...typeV2.label, color: palette.textSecondary },
  clubName: { ...typeV2.titleClub, color: palette.paper },
  actions: { marginTop: 24, gap: 12 },
  logout: { marginTop: 32 },
});
