import { Redirect } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabButton } from '@/components/TabButton';
import { useMyParticipation } from '@/features/participation/useMyParticipation';
import { useSessionStore } from '@/stores/sessionStore';
import { metrics, palette } from '@/theme';

// An admin who does not play has no club: Inicio and Plantilla have nothing to show, Administración takes their place.
// Every route stays registered; only the buttons change.
export default function TabsLayout() {
  const status = useSessionStore((s) => s.status);
  const role = useSessionStore((s) => s.user?.role);
  const participation = useMyParticipation();
  const insets = useSafeAreaInsets();
  if (status === 'signedOut') return <Redirect href="/login" />;
  const adminOnly = role === 'admin' && !participation.data;

  return (
    <Tabs>
      <View style={styles.slot}>
        <TabSlot />
      </View>
      <TabList style={[styles.bar, { height: metrics.tabBarHeight + insets.bottom, paddingBottom: insets.bottom }]}>
        <TabTrigger name="home" href="/home" asChild>
          <TabButton label="Inicio" icon="home" hidden={adminOnly} />
        </TabTrigger>
        <TabTrigger name="standings" href="/standings" asChild>
          <TabButton label="Tabla" icon="grid" />
        </TabTrigger>
        <TabTrigger name="fixtures" href="/fixtures" asChild>
          <TabButton label="Calendario" icon="calendar" />
        </TabTrigger>
        <TabTrigger name="admin" href="/admin" asChild>
          <TabButton label="Admin" icon="shield" hidden={!adminOnly} />
        </TabTrigger>
        <TabTrigger name="squad" href="/squad" asChild>
          <TabButton label="Plantilla" icon="users" hidden={adminOnly} />
        </TabTrigger>
        <TabTrigger name="profile" href="/profile" asChild>
          <TabButton label="Perfil" icon="user" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1 },
  bar: {
    flexDirection: 'row',
    backgroundColor: palette.ink,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
});
