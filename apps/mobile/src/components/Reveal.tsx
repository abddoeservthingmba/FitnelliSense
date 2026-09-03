/**
 * A fade-and-rise entrance, staggered down a list.
 *
 * What separates an expensive-feeling app from a cheap one is rarely the
 * animation itself — it is that content ARRIVES instead of appearing. A card
 * that fades up over 260ms reads as placed; the same card popping into
 * existence reads as a render.
 *
 * Three things keep it from becoming the usual staggered-list irritant:
 *
 * 1. **It runs once.** Re-animating on every re-render would make a screen
 *    flicker every time a query refetched behind it.
 * 2. **The stagger is capped.** `index * STEP_MS` unbounded means the tenth
 *    card waits three quarters of a second, and the fortieth is still waiting
 *    when you have finished scrolling. Past `MAX_STAGGER_MS` everything
 *    arrives together.
 * 3. **Reduce Motion skips it entirely** — content appears at full opacity,
 *    immediately, with no transform (NFR-U-04).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, type ViewStyle } from 'react-native';

export interface RevealProps {
  children: ReactNode;
  /** Position in a list. Drives the stagger; omit for a single element. */
  index?: number;
  /** Extra delay before the stagger, for a section that follows another. */
  delayMs?: number;
  style?: ViewStyle;
}

const DURATION_MS = 260;
const STEP_MS = 45;
/** Beyond this the stagger stops being elegant and starts being a queue. */
const MAX_STAGGER_MS = 260;
const RISE_PX = 10;

export function Reveal({ children, index = 0, delayMs = 0, style }: RevealProps) {
  // A ref, not state: the animation is driven imperatively and must survive
  // re-renders without restarting.
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      delay: delayMs + Math.min(index * STEP_MS, MAX_STAGGER_MS),
      // Ease-out: quick to start, settling at the end. Anything with a
      // bounce reads as a toy rather than as expensive.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // `index` and `delayMs` are in the deps, which looks like it would
    // re-animate a card whenever a list reorders. It does not: `progress`
    // lives in a ref, so by then it has already reached 1, and animating from
    // 1 to 1 is invisible. The entrance stays a once-per-mount event without
    // needing the dependency array to lie about what it reads.
  }, [reduceMotion, progress, delayMs, index]);

  // Held invisible until Reduce Motion is known — one frame — so a reduced
  // reader never catches the start of a transform they asked not to see.
  if (reduceMotion === null) return null;

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [RISE_PX, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
