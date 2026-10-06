import { Feather } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { TabTriggerSlotProps } from 'expo-router/ui';

import { tapSelect } from '@/haptics';
import { metrics, palette, typeV2 } from '@/theme';

type Props = TabTriggerSlotProps & { label: string; icon: React.ComponentProps<typeof Feather>['name']; hidden?: boolean };

/** One tab of the bottom bar: icon + label in paper and a 3 dp `signal` bar on top when active, nothing else (design-system-v2.md §7). */
export const TabButton = forwardRef<View, Props>(function TabButton({ label, icon, isFocused, hidden, ...rest }, ref) {
  const color = isFocused ? palette.signal : palette.textSecondary;
  // The route stays registered (still reachable by URL); only its button leaves the bar.
  if (hidden) return null;
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        tapSelect();
        rest.onPress?.(e);
      }}
      style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }}>
      {isFocused ? <Animated.View entering={FadeIn.duration(220)} style={styles.topBar} /> : null}
      <Feather name={icon} size={24} color={color} />
      <Text style={[typeV2.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: metrics.tabBarHeight },
  topBar: { position: 'absolute', top: 0, width: 40, height: 3, backgroundColor: palette.signal },
});
