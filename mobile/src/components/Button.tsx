import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { metrics, palette, radius, typeV2 } from '@/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

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

// Flat v2 buttons (design-system-v2.md §7): no gradient, no glow, no shadow.
export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, iconRight, style }: ButtonProps) {
  const inactive = !!(loading || disabled);
  const handlePress = inactive ? undefined : onPress;

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy: !!loading }}
        style={({ pressed }) => [
          styles.primary,
          inactive ? styles.primaryInactive : pressed && styles.primaryPressed,
          pressed && !inactive && styles.pressed,
          style,
        ]}
      >
        <Content
          label={label}
          color={inactive ? palette.textTertiary : palette.onSignal}
          loading={loading}
          icon={icon}
          iconRight={iconRight}
        />
      </Pressable>
    );
  }

  const isDanger = variant === 'dangerOutline';
  const color = inactive ? palette.textTertiary : isDanger ? palette.dangerText : palette.paper;
  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.secondary,
        isDanger && styles.dangerOutline,
        inactive && styles.secondaryInactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      <Content label={label} color={color} loading={loading} icon={icon} iconRight={iconRight} />
    </Pressable>
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
  pressed: { transform: [{ scale: 0.97 }] },
});
