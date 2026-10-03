import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { mediaUrl } from '@/config';
import { useSessionStore } from '@/stores/sessionStore';
import { colors, fonts, radii } from '@/theme';

export function initials(name: string, max = 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, max)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface RemoteImageProps {
  /** Backend path such as `/media/crests/<id>`, never a Supabase or third-party URL. */
  path?: string | null;
  fallbackText: string;
  size: number;
  radius: number;
  style?: StyleProp<ViewStyle>;
  fit: 'contain' | 'cover';
  dashed: boolean;
}

/**
 * Image from the backend's /media with the user's token, cached ON DISK by expo-image under a token-free
 * cacheKey (so a refreshed token still hits the cache and it works offline). Dashed placeholder with initials
 * while loading, when it fails, or when the club/player has no image.
 */
function RemoteImage({ path, fallbackText, size, radius, style, fit, dashed }: RemoteImageProps) {
  const token = useSessionStore((s) => s.accessToken);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const url = path ? mediaUrl(path) : null;
  const source = useMemo(
    () => (url && token ? { uri: url, headers: { Authorization: `Bearer ${token}` }, cacheKey: url } : null),
    [url, token],
  );

  // A new token or URL gives a failed image another chance.
  useEffect(() => {
    setFailed(false);
  }, [url, token]);
  useEffect(() => {
    setLoaded(false);
  }, [url]);

  const showPlaceholder = !loaded || failed || !source;
  // No overflow:hidden anywhere: on Android it clipped the image (and the dashed placeholder) to nothing.
  // The image rounds its own corners; the placeholder is a separate sibling that fills the box.
  return (
    <View style={[{ width: size, height: size }, style]}>
      {showPlaceholder ? (
        <View style={[styles.placeholder, { borderRadius: radius }, dashed && styles.dashed]}>
          <Text style={[styles.initials, { fontSize: Math.max(10, size * 0.32) }]} numberOfLines={1}>
            {fallbackText}
          </Text>
        </View>
      ) : null}
      {source && !failed ? (
        <Image
          source={source}
          style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: radius }}
          contentFit={fit}
          cachePolicy="disk"
          onLoad={(e) => {
            if (__DEV__) console.log('[media] loaded', url, `${e.source.width}x${e.source.height}`);
            setLoaded(true);
          }}
          onError={(e) => {
            if (__DEV__) console.warn('[media] FAILED', url, e.error);
            setFailed(true);
          }}
          accessibilityLabel={fallbackText}
        />
      ) : null}
    </View>
  );
}

export function ClubCrest({
  crestUrl,
  name,
  size = 48,
  style,
}: {
  crestUrl?: string | null;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <RemoteImage
      path={crestUrl}
      fallbackText={initials(name)}
      size={size}
      radius={Math.min(radii.crest, size / 3)}
      fit="contain"
      dashed
      style={style}
    />
  );
}

export function PlayerAvatar({
  photoUrl,
  name,
  size = 44,
  style,
  dashed = true,
}: {
  photoUrl?: string | null;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Dashed outline on the placeholder; off when the avatar already sits inside its own border. */
  dashed?: boolean;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const text = words.length > 1 ? initials(`${words[0]} ${words[words.length - 1]}`) : initials(name);
  return <RemoteImage path={photoUrl} fallbackText={text} size={size} radius={size / 2} fit="cover" dashed={dashed} style={style} />;
}

const styles = StyleSheet.create({
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderDashed },
  initials: { fontFamily: fonts.bold, color: colors.textSecondary, letterSpacing: 1 },
});
