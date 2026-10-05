import { Feather } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TabTriggerSlotProps } from 'expo-router/ui';

import { tapSelect } from '@/haptics';
import { metrics, palette, typeV2 } from '@/theme';

type Props = TabTriggerSlotProps & { label: string; icon: React.ComponentProps<typeof Feather>['name'] };

/** One tab of the bottom bar: icon + label in paper and a 3 dp `signal` bar on top when active, nothing else (design-system-v2.md §7). */
export const TabButton = forwardRef<View, Props>(function TabButton({ label, icon, isFocused, ...rest }, ref) {
  const color = isFocused ? palette.paper : palette.textSecondary;
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        tapSelect();
        rest.onPress?.(e);
      }}
      style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }}>
      {isFocused ? <View style={styles.topBar} /> : null}
      <Feather name={icon} size={24} color={color} />
      <Text style={[typeV2.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: metrics.tabBarHeight },
  topBar: { position: 'absolute', top: 0, width: 40, height: 3, backgroundColor: palette.signal },
});
