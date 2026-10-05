import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { metrics, palette, radius, typeV2 } from '@/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_MS = 90;

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'dangerOutline';
  loading?: boolean;
  disabled?: boolean;
  icon?: FeatherName;
  iconRight?: FeatherName;
  style?: StyleProp<ViewStyle>;
}

/** Scale 0.97 over 90 ms while pressed (design-system-v2.md §8); instant when the system asks for reduced motion. */
function usePressScale() {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const [down, setDown] = useState(false);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const to = (value: number) => {
    scale.value = reduce ? value : withTiming(value, { duration: PRESS_MS });
  };
  return {
    down,
    animated,
    handlers: {
      onPressIn: () => {
        setDown(true);
        to(0.97);
      },
      onPressOut: () => {
        setDown(false);
        to(1);
      },
    },
  };
}

// Flat v2 buttons (design-system-v2.md §7): no gradient, no glow, no shadow.
export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, iconRight, style }: ButtonProps) {
  const inactive = !!(loading || disabled);
  const handlePress = inactive ? undefined : onPress;
  const press = usePressScale();

  if (variant === 'primary') {
    return (
      <AnimatedPressable
        onPress={handlePress}
        {...press.handlers}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy: !!loading }}
        style={[styles.primary, inactive ? styles.primaryInactive : press.down && styles.primaryPressed, style, press.animated]}
      >
        <Content
          label={label}
          color={inactive ? palette.textTertiary : palette.onSignal}
          loading={loading}
          icon={icon}
          iconRight={iconRight}
        />
      </AnimatedPressable>
    );
  }

  const isDanger = variant === 'dangerOutline';
  const color = inactive ? palette.textTertiary : isDanger ? palette.dangerText : palette.paper;
  return (
    <AnimatedPressable
      onPress={handlePress}
      {...press.handlers}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={[styles.secondary, isDanger && styles.dangerOutline, inactive && styles.secondaryInactive, style, press.animated]}
    >
      <Content label={label} color={color} loading={loading} icon={icon} iconRight={iconRight} />
    </AnimatedPressable>
  );
}

function Content({
  label,
  color,
  loading,
  icon,
  iconRight,
}: {
  label: string;
  color: string;
  loading?: boolean;
  icon?: FeatherName;
  iconRight?: FeatherName;
}) {
  return (
    <View style={styles.content}>
      {loading ? <ActivityIndicator size={20} color={color} /> : icon ? <Feather name={icon} size={22} color={color} /> : null}
      <Text style={[typeV2.button, { color }]}>{label}</Text>
      {iconRight && !loading ? <Feather name={iconRight} size={22} color={color} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: metrics.buttonHeight,
    borderRadius: radius.button,
    backgroundColor: palette.signal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: palette.signalPressed },
  primaryInactive: { backgroundColor: palette.panelRaised },
  secondary: {
    height: metrics.buttonSecondaryHeight,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryInactive: { borderColor: palette.line },
  dangerOutline: { borderColor: 'rgba(229,56,76,0.5)' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
