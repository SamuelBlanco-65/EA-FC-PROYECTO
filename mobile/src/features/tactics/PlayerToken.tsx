import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts } from '@/theme';

import { dragTo, toPixels } from './geometry';
import { type BoardSlot, tokenName, tokenNumber } from './lineup';

export const TOKEN_RADIUS = 22;
/** Space kept free under the token so its name label never leaves the field. */
export const LABEL_SPACE = 18;
const LABEL_WIDTH = 96;

interface Props {
  slot: BoardSlot;
  index: number;
  fieldWidth: SharedValue<number>;
  fieldHeight: SharedValue<number>;
  onMoved: (index: number, x: number, y: number) => void;
}

/**
 * One draggable token. Its position lives in two shared values (normalized x/y) that the UI thread updates on
 * every gesture frame: React is only told when the finger LIFTS (onMoved), never per frame.
 */
export const PlayerToken = memo(function PlayerToken({ slot, index, fieldWidth, fieldHeight, onMoved }: Props) {
  const x = useSharedValue(slot.x);
  const y = useSharedValue(slot.y);
  const startX = useSharedValue(slot.x);
  const startY = useSharedValue(slot.y);
  const lift = useSharedValue(0);

  // A new target (formation change, loaded lineup) glides there; a drop that just reported the same spot is a no-op.
  useEffect(() => {
    x.value = withTiming(slot.x, { duration: 260 });
    y.value = withTiming(slot.y, { duration: 260 });
  }, [slot.x, slot.y, x, y]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .hitSlop(8)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
      lift.value = withTiming(1, { duration: 120 });
    })
    .onUpdate((e) => {
      const p = dragTo(
        { x: startX.value, y: startY.value },
        e.translationX,
        e.translationY,
        { width: fieldWidth.value, height: fieldHeight.value },
        TOKEN_RADIUS,
        LABEL_SPACE,
      );
      x.value = p.x;
      y.value = p.y;
    })
    .onEnd(() => {
      scheduleOnRN(onMoved, index, x.value, y.value);
    })
    .onFinalize(() => {
      lift.value = withTiming(0, { duration: 160 });
    });

  const tokenStyle = useAnimatedStyle(() => {
    const p = toPixels(x.value, y.value, { width: fieldWidth.value, height: fieldHeight.value });
    return {
      zIndex: lift.value > 0 ? 10 : 1,
      transform: [{ translateX: p.x - TOKEN_RADIUS }, { translateY: p.y - TOKEN_RADIUS }, { scale: 1 + 0.15 * lift.value }],
    };
  });

  const ghostStyle = useAnimatedStyle(() => {
    const p = toPixels(startX.value, startY.value, { width: fieldWidth.value, height: fieldHeight.value });
    return { opacity: lift.value, transform: [{ translateX: p.x - TOKEN_RADIUS }, { translateY: p.y - TOKEN_RADIUS }] };
  });

  const keeper = slot.role === 'POR';
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.ghost, ghostStyle]} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.holder, tokenStyle]}>
          <View style={[styles.disc, keeper && styles.discKeeper]}>
            <Text style={[styles.number, keeper && styles.numberKeeper]} allowFontScaling={false}>
              {tokenNumber(slot.player)}
            </Text>
          </View>
          <View style={styles.labelWrap} pointerEvents="none">
            <Text style={styles.label} numberOfLines={1} allowFontScaling={false}>
              {tokenName(slot.player.name)}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </>
  );
});

const D = TOKEN_RADIUS * 2;

const styles = StyleSheet.create({
  holder: { position: 'absolute', left: 0, top: 0, width: D, height: D },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: D,
    height: D,
    borderRadius: TOKEN_RADIUS,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  disc: {
    width: D,
    height: D,
    borderRadius: TOKEN_RADIUS,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.onWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discKeeper: { backgroundColor: colors.warning, borderColor: colors.onWhite },
  number: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  numberKeeper: { color: colors.textOnAccent },
  labelWrap: { position: 'absolute', top: D + 2, left: (D - LABEL_WIDTH) / 2, width: LABEL_WIDTH, alignItems: 'center' },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 14,
    color: colors.textPrimary,
    backgroundColor: 'rgba(7,10,20,0.78)',
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
