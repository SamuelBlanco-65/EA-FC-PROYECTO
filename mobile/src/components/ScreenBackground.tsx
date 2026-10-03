import { Canvas, Line, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors } from '@/theme';

type Glow = 'green' | 'blue' | 'red' | 'none';

const GLOW_COLORS: Record<Exclude<Glow, 'none'>, string> = {
  green: colors.glowGreen,
  blue: colors.glowBlue,
  red: colors.glowRed,
};

const STRIPE_ANGLE_RAD = (20 * Math.PI) / 180;
const STRIPE_GAP = 36;

/** bg + diagonal stripes (20 deg, 1 dp, 3 % white) + a radial glow in the top-right corner (design-system.md §6). */
export const ScreenBackground = memo(function ScreenBackground({ glow = 'green' }: { glow?: Glow }) {
  const { width, height } = useWindowDimensions();

  const stripes = useMemo(() => {
    const drift = height * Math.tan(STRIPE_ANGLE_RAD);
    const step = STRIPE_GAP / Math.cos(STRIPE_ANGLE_RAD);
    const lines: { x: number }[] = [];
    for (let x = -drift; x < width + step; x += step) lines.push({ x });
    return { lines, drift };
  }, [width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} color={colors.bg} />
        {glow !== 'none' && (
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient c={vec(width, 0)} r={width * 1.1} colors={[GLOW_COLORS[glow], 'transparent']} />
          </Rect>
        )}
        {stripes.lines.map(({ x }) => (
          <Line key={x} p1={vec(x, height)} p2={vec(x + stripes.drift, 0)} color={colors.stripe} strokeWidth={1} />
        ))}
      </Canvas>
    </View>
  );
});
