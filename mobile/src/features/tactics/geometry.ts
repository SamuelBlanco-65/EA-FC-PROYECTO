// Pure coordinate helpers for the tactical board. Positions are stored NORMALIZED (0..1 of the field, x to the
// right, y downwards, own goal at the bottom) so a lineup does not depend on the phone's screen size.
// The 'worklet' directive lets the drag gesture call these on the UI thread; in Node (tests) it is a plain string.

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return value < min ? min : value > max ? max : value;
}

/** Normalized (0..1) -> pixels inside a field of `size`. */
export function toPixels(nx: number, ny: number, size: Size): Point {
  'worklet';
  return { x: nx * size.width, y: ny * size.height };
}

/** Pixels -> normalized. An unmeasured field (0 px) gives 0 instead of NaN/Infinity. */
export function toNormalized(px: number, py: number, size: Size): Point {
  'worklet';
  return {
    x: size.width > 0 ? px / size.width : 0,
    y: size.height > 0 ? py / size.height : 0,
  };
}

/**
 * Keeps a token fully inside the field: its CENTRE may go no closer to an edge than `radius` px (plus
 * `extraBottom` px reserved under the token for the name label). Works in normalized units; the margin is
 * converted with the field size, so the same radius means a bigger normalized margin on a small field.
 * If the field is smaller than the token, the token is pinned to the middle.
 */
export function clampToField(nx: number, ny: number, size: Size, radius: number, extraBottom = 0): Point {
  'worklet';
  if (size.width <= 0 || size.height <= 0) return { x: 0, y: 0 };
  const minX = radius / size.width;
  const maxX = 1 - radius / size.width;
  const minY = radius / size.height;
  const maxY = 1 - (radius + extraBottom) / size.height;
  return {
    x: minX > maxX ? 0.5 : clamp(nx, minX, maxX),
    y: minY > maxY ? 0.5 : clamp(ny, minY, maxY),
  };
}

/** A drag: start position (normalized) + finger translation (px) -> new clamped normalized position. */
export function dragTo(
  start: Point,
  translationX: number,
  translationY: number,
  size: Size,
  radius: number,
  extraBottom = 0,
): Point {
  'worklet';
  const delta = toNormalized(translationX, translationY, size);
  return clampToField(start.x + delta.x, start.y + delta.y, size, radius, extraBottom);
}

/** Positions travel to the server with 4 decimals: enough for sub-pixel precision, stable for comparisons. */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
