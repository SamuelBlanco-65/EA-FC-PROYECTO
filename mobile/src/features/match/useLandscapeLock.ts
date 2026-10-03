import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';

/** Landscape while the room is open; back to portrait when it closes (the rest of the app is portrait). */
export function useLandscapeLock(): void {
  useEffect(() => {
    // A failed lock only leaves the screen in portrait; it must not crash the room.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);
}
