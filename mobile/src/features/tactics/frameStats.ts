// Frame-time accounting for the on-screen FPS meter. Pure, so it can run in a worklet (UI thread) and in tests.

/** A frame slower than this missed at least one 60 Hz screen refresh (16.7 ms) by a clear margin. */
export const SLOW_FRAME_MS = 25;

export interface FrameStats {
  frames: number;
  elapsedMs: number;
  /** Longest single frame seen. */
  worstMs: number;
  /** Frames slower than SLOW_FRAME_MS. */
  slowFrames: number;
}

export const EMPTY_STATS: FrameStats = { frames: 0, elapsedMs: 0, worstMs: 0, slowFrames: 0 };

export function addFrame(stats: FrameStats, frameMs: number): FrameStats {
  'worklet';
  return {
    frames: stats.frames + 1,
    elapsedMs: stats.elapsedMs + frameMs,
    worstMs: frameMs > stats.worstMs ? frameMs : stats.worstMs,
    slowFrames: stats.slowFrames + (frameMs > SLOW_FRAME_MS ? 1 : 0),
  };
}

/** Frames per second over the accounted time (0 when nothing was recorded). */
export function fpsOf(stats: FrameStats): number {
  'worklet';
  return stats.elapsedMs > 0 ? (stats.frames * 1000) / stats.elapsedMs : 0;
}
