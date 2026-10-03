import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/theme';

/** Text + chevron at the top left, no title bar (design-system.md §9). */
export function BackHeader({ label, title, fallback }: { label: string; title: string; fallback: string }) {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace(fallback as never));
  return (
    <View style={styles.header}>
      <Pressable onPress={back} style={styles.back} hitSlop={8} accessibilityRole="button">
        <Feather name="chevron-left" size={26} color={colors.textPrimary} />
        <Text style={styles.backText}>{label}</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16, gap: 4 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -6 },
  backText: { ...type.bodyStrong, color: colors.textPrimary },
  title: { ...type.titleScreen, fontSize: 34, color: colors.textPrimary },
});
