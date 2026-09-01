/**
 * The movement demonstration.
 *
 * The source gives two frames per exercise — start and end position — so the
 * "gif" is made here by cross-fading between them on a loop. That is genuinely
 * how the movement reads: contracted, extended, contracted.
 *
 * Everything §6.8 requires still holds. The client is handed `mediaId`s and
 * resolves each through `/media/:id/url`, which re-checks state and licence on
 * every request — so a takedown stops the animation on the next load. Missing,
 * broken and unlicensed all fall back to the placeholder (FR-MED-07), which is
 * the normal case for the 98 exercises with no match.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { routes, type MediaRef, type ResolvedMedia } from '@fi/shared';
import { api } from '../api/client';
import { keys } from '../api/query-client';
import { Overline, Text } from './Text';
import { useTheme } from '../theme';

export interface MovementDemoProps {
  media: readonly MediaRef[];
  name: string;
  height?: number;
}

/** How long each frame is held before crossing to the other. */
const FRAME_MS = 900;

export function MovementDemo({ media, name, height = 240 }: MovementDemoProps) {
  const theme = useTheme();
  const [playing, setPlaying] = useState(true);

  // Only images animate; a real video would play itself.
  const frames = media.filter((item) => item.kind === 'image').slice(0, 2);

  const resolved = useQueries({
    queries: frames.map((frame) => ({
      queryKey: keys.media(frame.mediaId),
      queryFn: () => api.get<ResolvedMedia>(routes.media.url(frame.mediaId)),
      staleTime: 10 * 60 * 1000,
      retry: false,
    })),
  });

  const urls = resolved
    .map((query) => query.data?.url)
    .filter((url): url is string => Boolean(url));

  const attribution = resolved.find((query) => query.data?.attribution)?.data?.attribution;
  const requiresAttribution = resolved.some((query) => query.data?.requiresAttribution);

  if (urls.length === 0) {
    return <DemoPlaceholder name={name} height={height} loading={resolved.some((q) => q.isLoading)} />;
  }

  return (
    <View style={{ gap: theme.space.sm }}>
      <Pressable
        onPress={() => setPlaying((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={
          urls.length > 1
            ? `${name} movement demonstration. Tap to ${playing ? 'pause' : 'play'}.`
            : `${name} demonstration`
        }
        style={{
          height,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          backgroundColor: theme.colors.surfaceRaised,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {urls.length > 1 ? (
          <CrossFade urls={urls} playing={playing} name={name} />
        ) : (
          <Image
            source={{ uri: urls[0] }}
            accessibilityLabel={`${name} demonstration`}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        )}

        {urls.length > 1 ? (
          <View
            style={{
              position: 'absolute',
              bottom: theme.space.sm,
              right: theme.space.sm,
              paddingHorizontal: theme.space.sm,
              paddingVertical: 2,
              backgroundColor: theme.colors.overlay,
              borderRadius: theme.radius.sm,
            }}
          >
            <Overline tone="accent">{playing ? 'playing' : 'paused'}</Overline>
          </View>
        ) : null}
      </Pressable>

      {/* FR-MED-04: rendered next to the media, never behind a tap. */}
      {requiresAttribution && attribution ? (
        <Text variant="caption" tone="faint">
          {attribution.text} · {attribution.sourceName} ({attribution.licence})
        </Text>
      ) : attribution ? (
        <Text variant="caption" tone="faint">
          {attribution.text}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Two stacked images with the top one's opacity driven back and forth.
 *
 * Both frames stay mounted so neither reloads on each cycle, and the animation
 * runs on the native driver — a JS-driven loop would stutter the moment the
 * user scrolls.
 */
function CrossFade({
  urls,
  playing,
  name,
}: {
  urls: readonly string[];
  playing: boolean;
  name: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!playing) {
      progress.stopAnimation();
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: FRAME_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: FRAME_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [playing, progress]);

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <Image
        source={{ uri: urls[0] }}
        accessibilityLabel={`${name}, starting position`}
        style={{ width: '100%', height: '100%', position: 'absolute' }}
        resizeMode="contain"
      />
      <Animated.Image
        source={{ uri: urls[1] }}
        accessibilityLabel={`${name}, end position`}
        style={{ width: '100%', height: '100%', position: 'absolute', opacity: progress }}
        resizeMode="contain"
      />
    </View>
  );
}

/** The deterministic fallback (FR-MED-07). Never an empty frame. */
function DemoPlaceholder({
  name,
  height,
  loading,
}: {
  name: string;
  height: number;
  loading: boolean;
}) {
  const theme = useTheme();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      accessible
      accessibilityLabel={`${name}. No demonstration available; follow the written instructions.`}
      style={{
        height,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.sm,
      }}
    >
      <Text variant="display" tone="faint">
        {initials || '·'}
      </Text>
      <Text variant="caption" tone="faint">
        {loading ? 'Loading demonstration' : 'Follow the written instructions below'}
      </Text>
    </View>
  );
}
