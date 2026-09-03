/**
 * Holds the app to a phone's shape when it is opened on a desktop browser.
 *
 * The web build is the same app, so on a laptop it was drawing a phone
 * interface across 1,400px: a six-tab bar spanning the whole window, a
 * settings list two words wide and forty centimetres long, and headings with
 * an ocean of empty background either side. Every colour and animation was
 * correct and it still did not look like the app, because a phone layout
 * stretched to a desktop window is not the same design — it is that design
 * broken.
 *
 * So above a breakpoint the app is confined to a phone-width column, centred,
 * with the Ascension's own backdrop filling the room around it. Nothing about
 * the app changes; it is given the shape it was drawn for.
 *
 * WHAT THIS DELIBERATELY IS NOT: a mockup. There is no drawn bezel, notch or
 * home button. Those are decoration on something that is genuinely the app,
 * and they would make it look like a preview of software rather than software.
 * A border, a radius and a shadow are enough to say "this is a device-shaped
 * thing" without pretending to be a photograph of one.
 *
 * Native renders `children` untouched — the guard is on `Platform.OS`, so this
 * cannot affect Android at all.
 */
import { Platform, View, useWindowDimensions, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { AscensionBackdrop } from '../features/ascension/AscensionBackdrop';
import { useTheme } from '../theme';

/**
 * Below this the browser window is phone-shaped already, so the frame would
 * only take space away. 900 matches the theme's `wide` breakpoint, so the app
 * is framed at exactly the point it stops being a single-column layout.
 */
const FRAME_FROM = 900;

/** A tall phone. Wide enough for the six-tab bar, narrow enough to read. */
const FRAME_WIDTH = 460;
/** Leaves a margin top and bottom so it reads as a panel, not a full column. */
const FRAME_MAX_HEIGHT = 940;

export function DeviceFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();

  if (Platform.OS !== 'web' || width < FRAME_FROM) {
    return <>{children}</>;
  }

  const frame: ViewStyle = {
    width: FRAME_WIDTH,
    height: Math.min(height - 48, FRAME_MAX_HEIGHT),
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg * 3,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    // `hidden` is what keeps the app's own rounded corners and its tab bar
    // inside the frame instead of bleeding past it.
    overflow: 'hidden',
    // The glow is the Ascension's accent, so the frame belongs to the theme
    // rather than sitting on top of it.
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 12 },
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.well,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* The same wallpaper as the app, filling the desk around the device. */}
      <AscensionBackdrop />
      <View style={frame}>{children}</View>
    </View>
  );
}
