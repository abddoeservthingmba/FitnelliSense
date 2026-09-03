/**
 * The launch screen: the mark, the name, the tagline.
 *
 * Shown while the session is being restored from secure storage — so it costs
 * no artificial delay. It occupies time the app was already spending, and
 * replaces a bare spinner that said "Signing you in…" on a blank ground.
 *
 * The chevron is drawn here rather than loaded as an image so it is the same
 * shape as the launcher icon at any density, and so it can animate. It fades
 * and rises on entry, which is the one place a flourish is warranted: the app
 * is called Ascension.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from './Text';
import { useTheme } from '../theme';

export const TAGLINE = 'Train. Rank. Repeat.';

/** The mark: a chevron inside four corner brackets, as on the launcher icon. */
export function AriseMark({ size = 96 }: { size?: number }) {
  const theme = useTheme();
  // A 100x100 space, so every figure below reads as a percentage.
  const arm = 26;
  const bracket = 5;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="ariseMark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.colors.text} />
          <Stop offset="1" stopColor={theme.colors.accent} />
        </LinearGradient>
      </Defs>

      {/*
        The A. Two subpaths with `evenodd`: the outer triangle, then the
        counter, which is cut out rather than drawn. Same construction as the
        launcher icon — outer form minus inner form, bounded below by the
        crossbar — so the two marks cannot drift apart.
      */}
      <Path
        d="M50 17 L79 79 L21 79 Z M50 31 L57 55 L43 55 Z"
        fill="url(#ariseMark)"
        fillRule="evenodd"
      />

      {/* Corner brackets, from one table so the four cannot drift apart. */}
      {[
        `M4 ${arm} L4 4 L${arm} 4`,
        `M${100 - arm} 4 L96 4 L96 ${arm}`,
        `M4 ${100 - arm} L4 96 L${arm} 96`,
        `M${100 - arm} 96 L96 96 L96 ${100 - arm}`,
      ].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={theme.colors.accent}
          strokeWidth={bracket}
          strokeLinecap="square"
          strokeLinejoin="miter"
          fill="none"
          opacity={0.9}
        />
      ))}
    </Svg>
  );
}

export function LaunchScreen({ message }: { message?: string }) {
  const theme = useTheme();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: theme.duration.reveal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, theme.duration.reveal]);

  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.xl,
      }}
      accessible
      accessibilityLabel={`Ascension. ${TAGLINE}`}
    >
      <Animated.View style={{ opacity: enter, transform: [{ translateY: rise }] }}>
        <View style={{ alignItems: 'center', gap: theme.space.lg }}>
          <AriseMark size={104} />

          <View style={{ alignItems: 'center', gap: theme.space.xs }}>
            {/*
              Tracked wide for presence, but less so than ARISE was: nine
              letters at 40pt with 6.6 of tracking is about 285px, which
              overflows a 320dp phone. Half the tracking, one line, and allowed
              to shrink — so the wordmark fits every screen without being
              re-tuned per device.
            */}
            <Text
              variant="display"
              weight="heavy"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ letterSpacing: theme.tracking.wider * 1.5 }}
              // The label is on the container; this would read it twice.
              accessibilityElementsHidden
            >
              ASCENSION
            </Text>
            <Text variant="caption" tone="muted" style={{ letterSpacing: theme.tracking.wide }}>
              {TAGLINE}
            </Text>
          </View>
        </View>
      </Animated.View>

      {message ? (
        <Text variant="micro" tone="faint">
          {message}
        </Text>
      ) : null}
    </View>
  );
}
