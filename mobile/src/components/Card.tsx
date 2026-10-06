import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { palette, radius, typeV2 } from '@/theme';

type Variant = 'default' | 'raised' | 'highlight' | 'danger' | 'dashed';

// v2 panel with a thin border and a soft shadow so it reads against the ink background.
// "Mine" (highlight) gets a signal border + glow, "dispute" (danger) a red tint; both keep the 4 dp side bar.
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
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
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
  raised: { backgroundColor: palette.panelRaised, borderColor: palette.lineStrong },
  highlight: { backgroundColor: palette.panelRaised, borderColor: palette.signalBorder, shadowColor: palette.signal, shadowOpacity: 0.3, elevation: 5 },
  danger: { backgroundColor: '#2A1B26', borderColor: palette.dangerBorder },
  dashed: { borderStyle: 'dashed', borderColor: palette.lineStrong, backgroundColor: 'transparent', borderWidth: 1.5, elevation: 0, shadowOpacity: 0 },
});
