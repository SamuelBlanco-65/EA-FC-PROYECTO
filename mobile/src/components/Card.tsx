import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radii, shadows, type } from '@/theme';

type Variant = 'default' | 'raised' | 'highlight' | 'danger' | 'dashed';

export function Card({
  variant = 'default',
  style,
  children,
}: PropsWithChildren<{ variant?: Variant; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.base, variantStyles[variant], style]}>{children}</View>;
}

/** Section label: 16x4 bar + uppercase text (design-system.md §7). */
export function Eyebrow({ children, tone = 'accent' }: PropsWithChildren<{ tone?: 'accent' | 'info' | 'danger' }>) {
  const bar = tone === 'info' ? colors.info : tone === 'danger' ? colors.danger : colors.accent;
  return (
    <View style={styles.eyebrow}>
      <View style={[styles.bar, { backgroundColor: bar }]} />
      <Text style={[type.eyebrow, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { width: 16, height: 4, borderRadius: 2 },
});

const variantStyles = StyleSheet.create({
  default: {},
  raised: { backgroundColor: colors.surfaceRaised },
  highlight: { borderColor: colors.accent, borderWidth: 1.5, ...shadows.glowAccent },
  danger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  dashed: { borderStyle: 'dashed', borderColor: colors.borderDashed, backgroundColor: 'transparent', borderWidth: 1.5 },
});
