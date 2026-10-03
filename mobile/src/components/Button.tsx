import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radii, shadows, type } from '@/theme';

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

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, iconRight, style }: ButtonProps) {
  const inactive = !!(loading || disabled);
  const handlePress = inactive ? undefined : onPress;

  if (variant === 'primary') {
    const textColor = inactive ? 'rgba(242,244,255,0.8)' : colors.textOnAccent;
    return (
      <Pressable
        onPress={handlePress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy: !!loading }}
        style={({ pressed }) => [styles.primaryWrap, !inactive && shadows.glowAccent, pressed && styles.pressed, style]}
      >
        {inactive ? (
          <View style={[styles.primary, { backgroundColor: colors.accentDisabled }]}>
            <Content label={label} color={textColor} loading={loading} icon={icon} iconRight={iconRight} />
          </View>
        ) : (
          <LinearGradient colors={[colors.accentGradientTop, colors.accentGradientBottom]} style={styles.primary}>
            <Content label={label} color={textColor} icon={icon} iconRight={iconRight} />
          </LinearGradient>
        )}
      </Pressable>
    );
  }

  const isDanger = variant === 'dangerOutline';
  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.secondary,
        isDanger && styles.dangerOutline,
        inactive && styles.dim,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Content
        label={label}
        color={isDanger ? colors.danger : colors.textPrimary}
        loading={loading}
        icon={icon}
        iconRight={iconRight}
      />
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
      <Text style={[type.button, { color }]}>{label}</Text>
      {iconRight && !loading ? <Feather name={iconRight} size={22} color={color} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  primaryWrap: { borderRadius: radii.button },
  primary: { height: 60, borderRadius: radii.button, alignItems: 'center', justifyContent: 'center' },
  secondary: {
    height: 56,
    borderRadius: radii.button,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerOutline: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.6 },
});
