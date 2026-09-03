/**
 * The chosen Ascension's mark, breathing.
 *
 * NOT a picture of a character. There is no licensed artwork here and there
 * should not be: an image of someone else's character is the one asset that
 * cannot be swapped out later without redrawing the screen around it, and it
 * would be the single most obvious thing in a takedown. A sigil is ours, it
 * scales to any size, it costs no download, and it recolours itself from the
 * Ascension's own palette.
 *
 * Each mark is built from the same three primitives — an outer ring, an inner
 * rotating ring, and a core — differing in count, speed and direction. That
 * keeps five identities in one component instead of five components, and means
 * a sixth Ascension is a row of numbers rather than a new file.
 *
 * The rotation is slow on purpose: 8 to 14 seconds a turn. Fast enough to be
 * alive, slow enough that it never competes with the numbers on the screen.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import type { Ascension } from '@fi/domain';
import { useTheme } from '../../theme';

export interface AscensionSigilProps {
  size?: number;
  /** Overrides the current Ascension — used by the picker to show all five. */
  ascension?: Ascension;
}

/** Spokes, seconds per rotation, and which way each mark turns. */
const SHAPE: Record<string, { spokes: number; seconds: number; reverse: boolean }> = {
  monarch: { spokes: 6, seconds: 14, reverse: false },
  saiyan: { spokes: 8, seconds: 9, reverse: false },
  shinobi: { spokes: 4, seconds: 11, reverse: true },
  shinigami: { spokes: 3, seconds: 13, reverse: true },
  pirate: { spokes: 5, seconds: 10, reverse: false },
};

const FALLBACK = { spokes: 6, seconds: 14, reverse: false };

export function AscensionSigil({ size = 96, ascension }: AscensionSigilProps) {
  const theme = useTheme();
  const active = ascension ?? theme.ascension;
  const shape = SHAPE[active.id] ?? FALLBACK;

  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let loops: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;

      loops = Animated.parallel([
        Animated.loop(
          Animated.timing(spin, {
            toValue: 1,
            duration: shape.seconds * 1000,
            // Linear, because a rotation that eases looks like it is faltering.
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 1,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(pulse, {
              toValue: 0,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ),
      ]);
      loops.start();
    });

    return () => {
      cancelled = true;
      loops?.stop();
    };
  }, [spin, pulse, shape.seconds]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: shape.reverse ? ['360deg', '0deg'] : ['0deg', '360deg'],
  });

  const ring = active.palette.accent;
  const core = active.palette.highlight;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      // One decorative element, announced once by whatever contains it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Outer ring: fixed, so the rotation reads against something still. */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: ring,
          opacity: 0.28,
        }}
      />

      {/* The spokes, rotating as one. */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ rotate }],
        }}
      >
        {Array.from({ length: shape.spokes }, (_, index) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: size / 2 - 1,
              top: 0,
              width: 2,
              height: size / 2,
              backgroundColor: ring,
              opacity: 0.55,
              // Rotated about the centre, so `height` reaches the middle and
              // the origin sits there rather than at the top of the strip.
              transform: [
                { translateY: size / 4 },
                { rotate: `${(360 / shape.spokes) * index}deg` },
                { translateY: -size / 4 },
              ],
            }}
          />
        ))}
      </Animated.View>

      {/* The core, breathing. Its scale is what makes the mark feel alive. */}
      <Animated.View
        style={{
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: size * 0.15,
          backgroundColor: core,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.06] }) },
          ],
          shadowColor: core,
          shadowOpacity: 0.9,
          shadowRadius: size * 0.2,
          shadowOffset: { width: 0, height: 0 },
        }}
      />

      <View
        style={{
          position: 'absolute',
          width: size * 0.52,
          height: size * 0.52,
          borderRadius: size * 0.26,
          borderWidth: 1,
          borderColor: theme.colors.borderStrong,
          opacity: 0.6,
        }}
      />
    </View>
  );
}
