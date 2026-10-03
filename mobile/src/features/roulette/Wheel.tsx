import { Canvas, Circle, Group, Path, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import type { Club } from '@/api/types';
import { colors, fonts, leagueColorFallback, leagueColors } from '@/theme';

const LEAGUE_ORDER = ['Bundesliga', 'LaLiga', 'Ligue 1', 'Premier League', 'Serie A'];

/** Shown before the server answers: 5 sectors per league, so the wheel looks the same as the real one. */
export const PLACEHOLDER_SECTORS: { league: string }[] = LEAGUE_ORDER.flatMap((league) =>
  Array.from({ length: 5 }, () => ({ league })),
);

interface WheelProps {
  size: number;
  sectors: { league: string }[];
  rotation: SharedValue<number>;
}

/** Degrees (clockwise from the top) at which sector `index` is centred when the wheel is not rotated. */
export const sectorCentre = (index: number, count: number) => ((index + 0.5) * 360) / count;

export function sectorsOf(clubs: Club[]): { league: string }[] {
  return clubs.map((c) => ({ league: c.league }));
}

export const Wheel = memo(function Wheel({ size, sectors, rotation }: WheelProps) {
  const centre = size / 2;
  const outer = size / 2 - 6;
  const ring = 18;
  const inner = outer - ring;

  const paths = useMemo(() => {
    const step = 360 / sectors.length;
    const rect = Skia.XYWHRect(centre - inner, centre - inner, inner * 2, inner * 2);
    return sectors.map((sector, i) => {
      // Skia angles start at 3 o'clock and grow clockwise; sector 0 starts at the top (-90).
      const path = Skia.PathBuilder.Make()
        .moveTo(centre, centre)
        .arcToOval(rect, -90 + i * step, step, false)
        .close()
        .build();
      return { path, color: leagueColors[sector.league] ?? leagueColorFallback, dim: i % 2 === 1 };
    });
  }, [sectors, centre, inner]);

  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i * 2 * Math.PI) / 16 - Math.PI / 2;
        return { x: centre + Math.cos(angle) * (outer - ring / 2), y: centre + Math.sin(angle) * (outer - ring / 2), lit: i % 2 === 0 };
      }),
    [centre, outer],
  );

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, spin]}>
        <Canvas style={StyleSheet.absoluteFill}>
          {paths.map(({ path, color, dim }, i) => (
            <Group key={i} opacity={dim ? 0.62 : 0.88}>
              <Path path={path} color={color} />
              <Path path={path} color={colors.bg} style="stroke" strokeWidth={2} />
            </Group>
          ))}
        </Canvas>
      </Animated.View>

      {/* Fixed layer: ring, lights and hub do not turn. */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle c={vec(centre, centre)} r={outer - ring / 2} color={colors.surfaceRaised} style="stroke" strokeWidth={ring} />
        <Circle c={vec(centre, centre)} r={outer} color={colors.accent} style="stroke" strokeWidth={2} />
        {dots.map((d, i) => (
          <Circle key={i} c={vec(d.x, d.y)} r={5} color={d.lit ? colors.accent : 'rgba(0,229,141,0.3)'} />
        ))}
        <Circle c={vec(centre, centre)} r={44} color={colors.surfaceSunken} />
        <Circle c={vec(centre, centre)} r={44} color={colors.accent} style="stroke" strokeWidth={5} />
      </Canvas>
      <View style={[styles.hub, { top: centre - 22, left: centre - 30 }]} pointerEvents="none">
        <Text style={styles.hubText}>FC</Text>
      </View>

      <View style={[styles.pointer, { left: centre - 22 }]} pointerEvents="none">
        <Canvas style={{ width: 44, height: 40 }}>
          <Path path="M 4 2 L 40 2 L 22 36 Z" color={colors.accent} />
          <Path path="M 4 2 L 40 2 L 22 36 Z" color={colors.bg} style="stroke" strokeWidth={3} />
        </Canvas>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hub: { position: 'absolute', width: 60, height: 44, alignItems: 'center', justifyContent: 'center' },
  hubText: { fontFamily: fonts.displayItalic, fontSize: 36, lineHeight: 40, color: colors.accent },
  pointer: { position: 'absolute', top: -14, width: 44, height: 40 },
});
