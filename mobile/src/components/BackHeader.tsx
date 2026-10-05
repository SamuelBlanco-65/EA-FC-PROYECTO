import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, typeV2 } from '@/theme';

/** Text of the real destination + chevron at the top left, then the screen title (design-system-v2.md §9). */
export function BackHeader({ label, title, fallback }: { label: string; title: string; fallback: string }) {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace(fallback as never));
  return (
    <View style={styles.header}>
      <Pressable onPress={back} style={styles.back} hitSlop={8} accessibilityRole="button">
        <Feather name="chevron-left" size={26} color={palette.paper} />
        <Text style={styles.backText}>{label}</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16, gap: 4 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -6 },
  backText: { ...typeV2.bodyStrong, color: palette.paper },
  title: { ...typeV2.titleScreen, color: palette.paper },
});
