import { Canvas, Circle, Group, Line, Rect, RoundedRect, rrect, rect, vec } from '@shopify/react-native-skia';
import { memo } from 'react';
import { StyleSheet } from 'react-native';

import type { Size } from './geometry';

const GRASS_DARK = '#1B6B3A';
const GRASS_LIGHT = '#1F7A42';
const LINE = 'rgba(255,255,255,0.55)';
const STRIPES = 10;
const RADIUS = 20;
const INSET = 14;

/**
 * The field, drawn once in Skia (static: it does not redraw while tokens move, they are separate views above it).
 * Proportions are fractions of the available size, so it fits any phone; own goal at the bottom.
 */
export const Pitch = memo(function Pitch({ width, height }: Size) {
  const left = INSET;
  const right = width - INSET;
  const top = INSET;
  const bottom = height - INSET;
  const w = right - left;
  const h = bottom - top;
  const midY = top + h / 2;
  const cx = left + w / 2;

  const bigW = w * 0.56;
  const bigH = h * 0.17;
  const smallW = w * 0.28;
  const smallH = h * 0.075;
  const stripeH = height / STRIPES;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group clip={rrect(rect(0, 0, width, height), RADIUS, RADIUS)}>
        <Rect x={0} y={0} width={width} height={height} color={GRASS_DARK} />
        {Array.from({ length: STRIPES / 2 }, (_, i) => (
          <Rect key={i} x={0} y={i * 2 * stripeH + stripeH} width={width} height={stripeH} color={GRASS_LIGHT} />
        ))}
      </Group>

      <RoundedRect x={left} y={top} width={w} height={h} r={6} color={LINE} style="stroke" strokeWidth={2} />
      <Line p1={vec(left, midY)} p2={vec(right, midY)} color={LINE} strokeWidth={2} />
      <Circle c={vec(cx, midY)} r={w * 0.15} color={LINE} style="stroke" strokeWidth={2} />
      <Circle c={vec(cx, midY)} r={3.5} color={LINE} />

      <Rect x={cx - bigW / 2} y={top} width={bigW} height={bigH} color={LINE} style="stroke" strokeWidth={2} />
      <Rect x={cx - smallW / 2} y={top} width={smallW} height={smallH} color={LINE} style="stroke" strokeWidth={2} />
      <Rect x={cx - bigW / 2} y={bottom - bigH} width={bigW} height={bigH} color={LINE} style="stroke" strokeWidth={2} />
      <Rect x={cx - smallW / 2} y={bottom - smallH} width={smallW} height={smallH} color={LINE} style="stroke" strokeWidth={2} />
    </Canvas>
  );
});
