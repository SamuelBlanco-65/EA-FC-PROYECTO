import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { palette, radius, typeV2 } from '@/theme';

import { Button } from './Button';

const SHIMMER_MS = 1200;

/** Placeholder block with a left-to-right shimmer sweep (design-system-v2.md §7). Screens compose several to mimic their shape. */
export function Skeleton({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.linear }), -1, false);
  }, [progress]);
  const band = width * 0.6;
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: -band + progress.value * (width + band) }] }));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={[styles.skeleton, { height }, style]}>
      {width > 0 ? (
        <Animated.View style={[styles.sweep, { width: band }, animated]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Goal frame + ball drawn with plain Views (no Canvas): the "empty" illustration. */
function GoalIllustration() {
  return (
    <View style={styles.goalWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.goal} />
      <View style={styles.ball}>
        <View style={styles.ballSpot} />
      </View>
    </View>
  );
}

export function ErrorState({
  title = 'No se pudo cargar',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Feather name="alert-triangle" size={48} color={palette.cardRed} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Reintentar" icon="refresh-cw" onPress={onRetry} style={styles.button} /> : null}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.center}>
      <GoalIllustration />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: palette.panel, borderRadius: radius.panel, overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  center: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 8, gap: 12 },
  goalWrap: { width: 132, height: 84, marginBottom: 4 },
  goal: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 132,
    height: 72,
    borderWidth: 5,
    borderBottomWidth: 0,
    borderColor: palette.lineStrong,
    borderTopLeftRadius: radius.badge,
    borderTopRightRadius: radius.badge,
  },
  ball: {
    position: 'absolute',
    left: 74,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballSpot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.ink },
  title: { ...typeV2.titleClub, textTransform: 'uppercase', color: palette.paper, textAlign: 'center' },
  message: { ...typeV2.body, color: palette.textSecondary, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 8 },
});
