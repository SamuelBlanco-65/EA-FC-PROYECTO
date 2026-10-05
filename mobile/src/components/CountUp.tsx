import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const DURATION_MS = 400;
// Ids already counted up in this session: the animation is for the first load only (design-system-v2.md §8).
const played = new Set<string>();

/** Counts from 0 to `value` over 400 ms the first time `id` appears; later changes show the new number straight away. */
export function CountUp({ id, value }: { id: string; value: number }) {
  const reduce = useReducedMotion();
  const play = useRef(!reduce && !played.has(id));
  const [shown, setShown] = useState(play.current ? 0 : value);

  useEffect(() => {
    if (!play.current) {
      setShown(value);
      return;
    }
    play.current = false;
    played.add(id);
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION_MS);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, value]);

  return <Text>{shown}</Text>;
}
