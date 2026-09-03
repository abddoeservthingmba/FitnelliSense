/**
 * The tab-press flourish: the icon leaves the bar and arrives in the middle of
 * the screen, spinning, with a sound under it.
 *
 * Three rules keep a full-screen animation from becoming a tax on the most
 * frequent gesture in the app:
 *
 * 1. **It never blocks navigation.** The screen changes immediately; this plays
 *    over the top of the screen you already arrived at. If it were a gate, the
 *    app would feel slower every single day.
 * 2. **It cannot queue.** A fast tapper restarts it, never stacks it.
 * 3. **It obeys Reduce Motion.** The one setting whose entire purpose is to say
 *    "do not do this to me" (NFR-U-04).
 *
 * The overlay is `pointerEvents="none"` throughout, so the screen underneath
 * stays live — you can tap a button through the flourish while it plays.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import navFlourishSound from '../../../assets/nav-flourish.wav';
import { ExtrudedGlyph } from './ExtrudedGlyph';
import { configureNavAudio, loadNavSound } from './nav-sound';
import { useTheme } from '../../theme';

/** Long enough to register as an event, short enough not to nag. */
const FLIGHT_MS = 560;
/** Where the bar sits, measured from the bottom. Close enough on every phone. */
const BAR_OFFSET = 84;
const GLYPH_SIZE = 96;

interface FlourishContextValue {
  /** `index` and `total` locate the pressed tab across the bar. */
  play: (glyph: string, index: number, total: number) => void;
}

const FlourishContext = createContext<FlourishContextValue>({ play: () => {} });

export function useTabFlourish(): FlourishContextValue {
  return useContext(FlourishContext);
}

export function TabFlourishProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();

  const progress = useSharedValue(0);
  const [glyph, setGlyph] = useState('◆');
  const originX = useSharedValue(0);

  const player = useAudioPlayer(navFlourishSound);
  const soundEnabled = useRef(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    void configureNavAudio();
    void loadNavSound().then((enabled) => {
      soundEnabled.current = enabled;
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => subscription.remove();
  }, []);

  const play = useCallback(
    (nextGlyph: string, index: number, total: number) => {
      // Haptics first: it lands before anything is drawn or decoded, which is
      // what makes the tap feel connected to the result.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (reduceMotion.current) return;

      setGlyph(nextGlyph);
      // The centre of the pressed tab, as an offset from the screen's middle.
      const tabCentre = (width / total) * (index + 0.5);
      originX.value = tabCentre - width / 2;

      progress.value = 0;
      progress.value = withTiming(1, {
        duration: FLIGHT_MS,
        easing: Easing.out(Easing.cubic),
      });

      if (soundEnabled.current) {
        // seekTo(0) so a rapid second tap restarts the effect rather than
        // being swallowed by a player that is already at the end.
        void player.seekTo(0).then(() => player.play());
      }
    },
    [originX, player, progress, width],
  );

  const originY = height / 2 - BAR_OFFSET;

  const glyphStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.1, 0.62, 1], [0, 1, 1, 0]),
      transform: [
        { perspective: 900 },
        { translateX: interpolate(p, [0, 0.62, 1], [originX.value, 0, 0]) },
        { translateY: interpolate(p, [0, 0.62, 1], [originY, 0, -26]) },
        { scale: interpolate(p, [0, 0.5, 0.62, 1], [0.28, 1.14, 1, 1.3]) },
        { rotateX: `${interpolate(p, [0, 0.62, 1], [58, 0, -14])}deg` },
        { rotateY: `${interpolate(p, [0, 0.62, 1], [-140, 0, 46])}deg` },
      ],
    };
  });

  // A ring pushing outward from the arrival point. It is what makes the moment
  // read as energetic rather than merely smooth.
  const ringStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.5, 0.62, 0.95], [0, 0, 0.5, 0]),
      transform: [{ scale: interpolate(p, [0.5, 0.95], [0.2, 2.6]) }],
    };
  });

  return (
    <FlourishContext.Provider value={{ play }}>
      <View style={{ flex: 1 }}>
        {children}

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: GLYPH_SIZE * 2,
                height: GLYPH_SIZE * 2,
                borderRadius: GLYPH_SIZE,
                borderWidth: 2,
                borderColor: theme.colors.accent,
              },
              ringStyle,
            ]}
          />
          <Animated.View style={glyphStyle}>
            <ExtrudedGlyph glyph={glyph} size={GLYPH_SIZE} />
          </Animated.View>
        </View>
      </View>
    </FlourishContext.Provider>
  );
}
