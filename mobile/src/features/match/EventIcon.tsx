import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { EventType } from '@/api/types';
import { palette } from '@/theme';

export const EVENT_COLOR: Record<EventType, string> = {
  GOAL: palette.signal,
  YELLOW: palette.cardYellow,
  RED: palette.cardRed,
};

/** Ball for goals, a small tilted card for yellow/red. */
export function EventIcon({ type, size = 26, color }: { type: EventType; size?: number; color?: string }) {
  if (type === 'GOAL') {
    return <MaterialCommunityIcons name="soccer" size={size} color={color ?? palette.paper} />;
  }
  const w = size * 0.55;
  return (
    <View
      style={[
        styles.card,
        { width: w, height: size * 0.75, borderRadius: Math.max(2, size * 0.1), backgroundColor: color ?? EVENT_COLOR[type] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: { transform: [{ rotate: '8deg' }] },
});
