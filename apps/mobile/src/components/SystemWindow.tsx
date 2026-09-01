/**
 * The System window — the app's signature surface.
 *
 * A notification panel with cut corners and a glowing edge. Drawn with an SVG
 * border rather than a `View` because the corners are chamfered, which a
 * border-radius cannot do, and because the glow is a real stroke rather than a
 * shadow that Android would render differently from web (R7).
 *
 * `tone` decides what the light means: `system` for ordinary panels, `alert`
 * for a level-up, `monarch` for the rarest moments.
 */
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Overline } from './Text';
import { useTheme } from '../theme';

export type WindowTone = 'system' | 'alert' | 'monarch' | 'quiet';

export interface SystemWindowProps {
  children: ReactNode;
  /** Rendered in the top-left notch, uppercase and tracked. */
  label?: string;
  tone?: WindowTone;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** How deep the corner cut is, in dp. */
const CHAMFER = 14;

export function SystemWindow({
  children,
  label,
  tone = 'system',
  padded = true,
  style,
}: SystemWindowProps) {
  const theme = useTheme();

  const edge =
    tone === 'alert'
      ? theme.colors.accent
      : tone === 'monarch'
        ? theme.colors.monarch
        : tone === 'quiet'
          ? theme.colors.border
          : theme.colors.borderStrong;

  const fill = tone === 'monarch' ? theme.colors.monarchSoft : theme.colors.surface;

  return (
    <View style={[{ position: 'relative' }, style]}>
      {/* The frame is absolutely positioned behind the content so the window
          sizes to whatever it contains rather than needing a fixed height. */}
      <View style={{ ...StyleSheetAbsoluteFill }} pointerEvents="none">
        <ChamferedFrame edge={edge} fill={fill} glow={tone === 'alert' || tone === 'monarch'} />
      </View>

      <View style={{ padding: padded ? theme.space.lg : 0 }}>
        {label ? (
          <View style={{ marginBottom: theme.space.md }}>
            <Overline tone={tone === 'alert' ? 'accent' : tone === 'monarch' ? 'monarch' : 'faint'}>
              {label}
            </Overline>
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/**
 * The chamfered outline. `preserveAspectRatio="none"` lets one path stretch to
 * any panel size, which keeps this to a single draw regardless of content.
 */
function ChamferedFrame({
  edge,
  fill,
  glow,
}: {
  edge: string;
  fill: string;
  glow: boolean;
}) {
  // A 100×100 box stretched to fit; the chamfer is expressed as a percentage so
  // it stays visually similar across panel sizes.
  const c = CHAMFER;
  const path = `M${c},0 L100,0 L100,${100 - c} L${100 - c},100 L0,100 L0,${c} Z`;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="systemEdge" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={edge} stopOpacity={glow ? 1 : 0.9} />
          <Stop offset="0.5" stopColor={edge} stopOpacity={glow ? 0.55 : 0.35} />
          <Stop offset="1" stopColor={edge} stopOpacity={glow ? 0.95 : 0.7} />
        </LinearGradient>
      </Defs>
      <Path
        d={path}
        fill={fill}
        stroke="url(#systemEdge)"
        strokeWidth={glow ? 1.6 : 0.8}
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

/**
 * A corner-bracket frame — lighter than a full window, used for stat blocks
 * where four full edges would be noise.
 */
export function Brackets({
  children,
  tone = 'system',
  style,
}: {
  children: ReactNode;
  tone?: WindowTone;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const colour = tone === 'alert' ? theme.colors.accent : theme.colors.borderStrong;

  return (
    <View style={[{ position: 'relative', padding: theme.space.md }, style]}>
      {CORNERS.map((anchor) => (
        <Corner key={`${anchor.vertical}-${anchor.horizontal}`} anchor={anchor} colour={colour} />
      ))}
      {children}
    </View>
  );
}

const CORNERS = [
  { vertical: 'top', horizontal: 'left' },
  { vertical: 'top', horizontal: 'right' },
  { vertical: 'bottom', horizontal: 'left' },
  { vertical: 'bottom', horizontal: 'right' },
] as const;

type CornerAnchor = (typeof CORNERS)[number];

/** One bracket: two bars meeting at a corner, positioned by which corner it is. */
function Corner({ anchor, colour }: { anchor: CornerAnchor; colour: string }) {
  const LENGTH = 10;
  const THICKNESS = 1.5;
  const box: ViewStyle = { [anchor.vertical]: 0, [anchor.horizontal]: 0 };

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: LENGTH, height: LENGTH, ...box }}
    >
      <View
        style={{
          position: 'absolute',
          width: LENGTH,
          height: THICKNESS,
          backgroundColor: colour,
          ...box,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: THICKNESS,
          height: LENGTH,
          backgroundColor: colour,
          ...box,
        }}
      />
    </View>
  );
}
