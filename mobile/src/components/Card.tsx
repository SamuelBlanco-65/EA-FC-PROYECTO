import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { palette, radius, typeV2 } from '@/theme';

type Variant = 'default' | 'raised' | 'highlight' | 'danger' | 'dashed';

// Flat v2 panel: relief comes from the surface contrast, not from borders or shadows (design-system-v2.md §6).
// "Mine" (highlight) and "dispute" (danger) are marked with a 4 dp side bar, not with colour fills.
export function Card({
  variant = 'default',
  style,
  children,
}: PropsWithChildren<{ variant?: Variant; style?: StyleProp<ViewStyle> }>) {
  const bar = variant === 'highlight' ? palette.paper : variant === 'danger' ? palette.cardRed : null;
  return (
    <View style={[styles.base, variantStyles[variant], style]}>
      {bar ? <View style={[styles.bar, { backgroundColor: bar }]} /> : null}
      {children}
    </View>
  );
}

/** Section label: small uppercase text, no bar (design-system-v2.md §2 rule 7). */
export function Eyebrow({ children, tone }: PropsWithChildren<{ tone?: 'danger' }>) {
  return <Text style={[typeV2.label, { color: tone === 'danger' ? palette.dangerText : palette.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.panel,
    backgroundColor: palette.panel,
    padding: 16,
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.panel,
    borderBottomLeftRadius: radius.panel,
  },
});

const variantStyles = StyleSheet.create({
  default: {},
  raised: { backgroundColor: palette.panelRaised },
  highlight: { backgroundColor: palette.panelRaised },
  danger: {},
  dashed: { borderStyle: 'dashed', borderColor: palette.lineStrong, backgroundColor: 'transparent', borderWidth: 1.5 },
});
