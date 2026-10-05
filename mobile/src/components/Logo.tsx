import { StyleSheet, Text, View } from 'react-native';

import { palette, radius, typeV2 } from '@/theme';

/** FC ARENA mark: flat `signal` block with "FC" next to the wordmark; no tilt, glow or gradient (design-system-v2.md §2). */
export function Logo() {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.mark}>
          <Text style={styles.markText}>FC</Text>
        </View>
        <Text style={styles.word}>ARENA</Text>
      </View>
      <Text style={styles.tagline}>Tu torneo privado entre amigos</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 64, height: 56, borderRadius: radius.button, backgroundColor: palette.signal, alignItems: 'center', justifyContent: 'center' },
  markText: { ...typeV2.scoreBug, color: palette.onSignal },
  word: { ...typeV2.scoreHero, color: palette.paper },
  tagline: { ...typeV2.label, color: palette.textSecondary, marginTop: 12 },
});
