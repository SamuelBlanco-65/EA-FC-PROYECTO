import { PropsWithChildren } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme';

import { ConnectionBanner, useBannerMode } from './ConnectionBanner';
import { ScreenBackground } from './ScreenBackground';

interface ScreenProps {
  glow?: 'green' | 'blue' | 'red' | 'none';
  /** Scrollable body with the 16 dp side margin. Without it, children fill the screen and lay themselves out. */
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Tab screens sit above the tab bar, which already handles the bottom inset; full-screen ones do not. */
  bottomInset?: boolean;
  /** Hide the connection banner (auth screens: login is online-only and shows its own message). */
  banner?: boolean;
}

export function Screen({
  glow = 'green',
  scroll = true,
  onRefresh,
  refreshing = false,
  bottomInset = false,
  banner = true,
  children,
}: PropsWithChildren<ScreenProps>) {
  const insets = useSafeAreaInsets();
  const mode = useBannerMode();
  const showBanner = banner && mode !== null;
  // The banner paints under the status bar itself, so the content only needs the inset when there is no banner.
  const topPadding = showBanner ? 12 : insets.top + 12;
  const bottomPadding = (bottomInset ? insets.bottom : 0) + 24;

  return (
    <View style={styles.root}>
      <ScreenBackground glow={glow} />
      {showBanner && mode ? <ConnectionBanner mode={mode} /> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingTop: topPadding, paddingBottom: bottomPadding }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
                progressBackgroundColor={colors.surfaceRaised}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: topPadding, paddingBottom: bottomPadding }}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
