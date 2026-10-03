import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadows } from '@/theme';

/** FC ARENA mark: tilted green block with "FC" + "ARENA" with a green->blue underline (design-system.md §8). */
export function Logo() {
  return (
    <View>
      <View style={styles.row}>
        <LinearGradient
          colors={[colors.accentGradientTop, colors.accentGradientBottom]}
          style={[styles.mark, shadows.glowAccent]}
        >
          <Text style={styles.markText}>FC</Text>
        </LinearGradient>
        <View>
          <Text style={styles.word}>ARENA</Text>
          <LinearGradient colors={[colors.accent, colors.info, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.underline} />
        </View>
      </View>
      <View style={styles.tagline}>
        <View style={styles.bar} />
        <Text style={styles.taglineText}>TU TORNEO PRIVADO ENTRE AMIGOS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: {
    width: 64,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ skewX: '-10deg' }],
  },
  markText: { fontFamily: fonts.displayItalic, fontSize: 30, color: colors.textOnAccent },
  word: { fontFamily: fonts.displayItalic, fontSize: 52, lineHeight: 54, color: colors.textPrimary, letterSpacing: 1 },
  underline: { height: 3, borderRadius: 2, marginTop: 2 },
  tagline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  bar: { width: 14, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  taglineText: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 2.5, color: colors.textSecondary },
});
