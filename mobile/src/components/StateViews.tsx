import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, type } from '@/theme';

import { Button } from './Button';

/** Placeholder block while data loads (design 15: pulsing surface blocks). */
export function Skeleton({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [progress]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + progress.value * 0.45 }));
  return <Animated.View style={[styles.skeleton, { height }, animated, style]} />;
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
      <View style={styles.errorCircle}>
        <Feather name="alert-triangle" size={40} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Reintentar" icon="refresh-cw" onPress={onRetry} style={styles.button} /> : null}
    </View>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  message,
}: {
  icon?: React.ComponentProps<typeof Feather>['name'];
  title: string;
  message: string;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.emptyCircle}>
        <Feather name={icon} size={36} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: colors.surfaceRaised, borderRadius: 16 },
  center: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 8, gap: 12 },
  errorCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1.5,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.titleCard, color: colors.textPrimary, textAlign: 'center' },
  message: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 8 },
});
