import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts } from '@/theme';

import { addFrame, EMPTY_STATS, type FrameStats, fpsOf } from './frameStats';

export const RECORD_SECONDS = 30;
const RECORD_MS = RECORD_SECONDS * 1000;

export interface FpsReport {
  seconds: number;
  uiAvg: number;
  /** Lowest 1-second window of the UI thread. */
  uiMin: number;
  slowFrames: number;
  worstMs: number;
  jsAvg: number;
}

type Mode = { kind: 'live' } | { kind: 'recording'; elapsed: number } | { kind: 'done'; report: FpsReport };

const one = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Live frame rate of the UI thread (the one that moves the tokens) and of the JS thread, updated once per second.
 * Tap to record 30 s while dragging tokens; the summary stays on screen and is printed in the Metro log.
 * The meter itself costs one callback per frame; numbers are only meaningful in a real drag session.
 */
export function FpsMeter() {
  const [uiFps, setUiFps] = useState(0);
  const [jsFps, setJsFps] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: 'live' });

  // UI-thread state (worklet side).
  const windowStats = useSharedValue<FrameStats>(EMPTY_STATS);
  const session = useSharedValue<FrameStats>(EMPTY_STATS);
  const sessionMin = useSharedValue(Number.POSITIVE_INFINITY);
  const recording = useSharedValue(false);

  // JS-thread state.
  const jsFrames = useRef(0);
  const jsFramesAtStart = useRef(0);

  const onTick = useCallback((ui: number, elapsedMs: number) => {
    setUiFps(ui);
    if (elapsedMs >= 0) setMode({ kind: 'recording', elapsed: Math.min(RECORD_SECONDS, Math.round(elapsedMs / 1000)) });
  }, []);

  const onDone = useCallback((stats: FrameStats, minWindowFps: number) => {
    const seconds = stats.elapsedMs / 1000;
    const report: FpsReport = {
      seconds: Math.round(seconds * 10) / 10,
      uiAvg: Math.round(fpsOf(stats) * 10) / 10,
      uiMin: Math.round(minWindowFps),
      slowFrames: stats.slowFrames,
      worstMs: Math.round(stats.worstMs),
      jsAvg: seconds > 0 ? Math.round(((jsFrames.current - jsFramesAtStart.current) / seconds) * 10) / 10 : 0,
    };
    setMode({ kind: 'done', report });
    console.log(`[tactics-fps] ${JSON.stringify(report)}`);
  }, []);

  useFrameCallback((info) => {
    const dt = info.timeSincePreviousFrame;
    if (dt === null) return;
    windowStats.value = addFrame(windowStats.value, dt);
    if (recording.value) session.value = addFrame(session.value, dt);

    if (windowStats.value.elapsedMs >= 1000) {
      const fps = fpsOf(windowStats.value);
      windowStats.value = EMPTY_STATS;
      if (recording.value && fps < sessionMin.value) sessionMin.value = fps;
      scheduleOnRN(onTick, Math.round(fps), recording.value ? session.value.elapsedMs : -1);
    }
    if (recording.value && session.value.elapsedMs >= RECORD_MS) {
      recording.value = false;
      scheduleOnRN(onDone, session.value, sessionMin.value);
    }
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    const loop = (now: number) => {
      frames += 1;
      jsFrames.current += 1;
      if (now - last >= 1000) {
        setJsFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = () => {
    if (mode.kind === 'recording') return;
    session.value = EMPTY_STATS;
    sessionMin.value = Number.POSITIVE_INFINITY;
    jsFramesAtStart.current = jsFrames.current;
    recording.value = true;
    setMode({ kind: 'recording', elapsed: 0 });
  };

  const bad = uiFps > 0 && uiFps < 55;
  return (
    <Pressable onPress={start} style={styles.chip} accessibilityRole="button" accessibilityLabel="Medir FPS durante 30 segundos">
      <View style={styles.row}>
        <View style={[styles.dot, bad && styles.dotBad]} />
        <Text style={[styles.text, bad && styles.textBad]}>{uiFps} FPS</Text>
        <Text style={styles.sub}>JS {jsFps}</Text>
      </View>
      {mode.kind === 'live' ? <Text style={styles.hint}>Toca para medir {RECORD_SECONDS} s</Text> : null}
      {mode.kind === 'recording' ? (
        <Text style={styles.rec}>
          REC {mode.elapsed}/{RECORD_SECONDS} s · arrastra fichas
        </Text>
      ) : null}
      {mode.kind === 'done' ? (
        <Text style={styles.done}>
          {one(mode.report.seconds)} s · prom {one(mode.report.uiAvg)} · mín {mode.report.uiMin} · lentos{' '}
          {mode.report.slowFrames} · peor {mode.report.worstMs} ms · JS {one(mode.report.jsAvg)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    top: 12,
    right: 12,
    maxWidth: 230,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(7,10,20,0.78)',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  dotBad: { backgroundColor: colors.warning },
  text: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.accent, fontVariant: ['tabular-nums'] },
  textBad: { color: colors.warning },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  rec: { fontFamily: fonts.semibold, fontSize: 11, color: colors.danger },
  done: { fontFamily: fonts.medium, fontSize: 11, color: colors.textPrimary },
});
