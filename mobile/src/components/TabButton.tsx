import { Feather } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TabTriggerSlotProps } from 'expo-router/ui';

import { colors, type } from '@/theme';

type Props = TabTriggerSlotProps & { label: string; icon: React.ComponentProps<typeof Feather>['name'] };

/** One tab of the bottom bar: skewed pill behind the icon and a 3x40 bar on top when active (design-system.md §9). */
export const TabButton = forwardRef<View, Props>(function TabButton({ label, icon, isFocused, ...rest }, ref) {
  const color = isFocused ? colors.accent : colors.textSecondary;
  return (
    <Pressable ref={ref} {...rest} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }}>
      {isFocused ? <View style={styles.topBar} /> : null}
      <View style={styles.iconBox}>
        {isFocused ? <View style={styles.pill} /> : null}
        <Feather name={icon} size={24} color={color} />
      </View>
      <Text style={[type.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: 72 },
  topBar: { position: 'absolute', top: 0, width: 40, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  iconBox: { width: 64, height: 36, alignItems: 'center', justifyContent: 'center' },
  pill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    transform: [{ skewX: '-10deg' }],
  },
});
