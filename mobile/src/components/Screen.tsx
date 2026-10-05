import { useIsFocused } from 'expo-router';
import { PropsWithChildren, useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { metrics, palette } from '@/theme';

import { ConnectionBanner, useBannerMode } from './ConnectionBanner';

const FADE_MS = 160;

interface ScreenProps {
  /** Scrollable body with the 16 dp side margin. Without it, children fill the screen and lay themselves out. */
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Tab screens sit above the tab bar, which already handles the bottom inset; full-screen ones do not. */
  bottomInset?: boolean;
  /** Hide the connection banner (auth screens: login is online-only and shows its own message). */
  banner?: boolean;
}

/**
 * Tab screens stay mounted while hidden, so a mount animation never replays when you come back to a tab.
 * This fades the content in each time the screen regains focus (never on first mount: that would hide it if the animation failed).
 */
function useFocusFade() {
  const focused = useIsFocused();
  const reduce = useReducedMotion();
  const wasFocused = useRef(focused);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (focused && !wasFocused.current && !reduce) {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: FADE_MS });
    }
    wasFocused.current = focused;
  }, [focused, reduce, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export function Screen({
  scroll = true,
  onRefresh,
  refreshing = false,
  bottomInset = false,
  banner = true,
  children,
}: PropsWithChildren<ScreenProps>) {
  const insets = useSafeAreaInsets();
  const mode = useBannerMode();
  const fade = useFocusFade();
  const showBanner = banner && mode !== null;
  // The banner paints under the status bar itself, so the content only needs the inset when there is no banner.
  const topPadding = showBanner ? 12 : insets.top + 12;
  const bottomPadding = (bottomInset ? insets.bottom : 0) + 24;

  return (
    <Animated.View style={[styles.root, fade]}>
      {showBanner && mode ? <ConnectionBanner mode={mode} /> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: metrics.screenPadding, paddingTop: topPadding, paddingBottom: bottomPadding }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={palette.signal}
                colors={[palette.signal]}
                progressBackgroundColor={palette.panelRaised}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: topPadding, paddingBottom: bottomPadding }}>{children}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ink },
});
