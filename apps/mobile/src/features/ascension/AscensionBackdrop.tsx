/**
 * The ambient wallpaper behind a screen.
 *
 * Generated geometry, not a photograph. A wallpaper per Ascension per tab would
 * be a pile of megabytes to download, licence and keep in step with seven
 * palettes; a pattern drawn from the palette costs nothing, stays sharp on any
 * screen, and turns over the instant someone changes Ascension.
 *
 * IT HAS TO STAY OUT OF THE WAY. Kept at 4–7% opacity, behind everything, with
 * `pointerEvents="none"`. The test of a backdrop is that you notice the screen
 * feels finished and cannot say why — if you can read the pattern, it is
 * competing with the numbers, which are the reason anyone opened the app.
 *
 * Each Ascension gets its own geometry, so the backdrop is a second, quieter
 * signal of which one you are on.
 */
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { Motif } from '@fi/domain';
import { useTheme } from '../../theme';

export interface AscensionBackdropProps {
  /** Slightly stronger on a hero screen, fainter behind dense lists. */
  intensity?: 'quiet' | 'normal';
}

const W = 400;
const H = 800;

export function AscensionBackdrop({ intensity = 'normal' }: AscensionBackdropProps) {
  const theme = useTheme();
  const accent = theme.ascension.palette.accent;
  const opacity = intensity === 'quiet' ? 0.04 : 0.07;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      // Decoration only; it must never be announced or focusable.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          {/* A glow from the top, so the pattern fades out down the page and
              never fights the content in the middle of the screen. */}
          <RadialGradient id="fade" cx="50%" cy="12%" r="80%">
            <Stop offset="0%" stopColor={accent} stopOpacity={opacity * 2.2} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={W} height={H} fill="url(#fade)" />
        <G opacity={opacity}>{pattern(theme.ascension.motif, accent)}</G>
      </Svg>
    </View>
  );
}

/** The geometry, chosen so each Ascension's backdrop is its own. */
function pattern(motif: Motif, accent: string) {
  switch (motif) {
    /* Concentric gates, receding. */
    case 'crown':
      return Array.from({ length: 7 }, (_, index) => (
        <Circle
          key={index}
          cx={W * 0.5}
          cy={H * 0.22}
          r={40 + index * 52}
          stroke={accent}
          strokeWidth={1.5}
          fill="none"
        />
      ));

    /* Rising energy: vertical streaks of varying length. */
    case 'spike':
      return Array.from({ length: 26 }, (_, index) => {
        const x = (index / 26) * W + 6;
        const length = 60 + ((index * 97) % 220);
        return (
          <Line
            key={index}
            x1={x}
            y1={H - 20}
            x2={x + 14}
            y2={H - 20 - length}
            stroke={accent}
            strokeWidth={2}
          />
        );
      });

    /* Shuriken scattered on a grid. */
    case 'band':
      return Array.from({ length: 18 }, (_, index) => {
        const x = 30 + (index % 3) * 150 + ((index * 37) % 40);
        const y = 40 + Math.floor(index / 3) * 130 + ((index * 61) % 50);
        return (
          <Polygon
            key={index}
            points={`${x},${y - 14} ${x + 5},${y - 5} ${x + 14},${y} ${x + 5},${y + 5} ${x},${y + 14} ${x - 5},${y + 5} ${x - 14},${y} ${x - 5},${y - 5}`}
            stroke={accent}
            strokeWidth={1.4}
            fill="none"
          />
        );
      });

    /* Falling ash, and the vertical line of a blade. */
    case 'horn':
      return (
        <>
          <Line x1={W * 0.78} y1={0} x2={W * 0.78} y2={H} stroke={accent} strokeWidth={1} />
          {Array.from({ length: 40 }, (_, index) => (
            <Circle
              key={index}
              cx={(index * 137) % W}
              cy={(index * 211) % H}
              r={1.6 + ((index * 7) % 3)}
              fill={accent}
            />
          ))}
        </>
      );

    /* Waves. */
    case 'brim':
      return Array.from({ length: 12 }, (_, index) => {
        const y = 60 + index * 64;
        return (
          <Path
            key={index}
            d={`M ${-20} ${y} Q ${W * 0.25} ${y - 26} ${W * 0.5} ${y} T ${W + 20} ${y}`}
            stroke={accent}
            strokeWidth={1.6}
            fill="none"
          />
        );
      });

    /* Impact lines radiating from one point — one punch. */
    case 'cape':
      return Array.from({ length: 22 }, (_, index) => {
        const angle = (index / 22) * Math.PI * 2;
        const originX = W * 0.5;
        const originY = H * 0.2;
        return (
          <Line
            key={index}
            x1={originX + Math.cos(angle) * 60}
            y1={originY + Math.sin(angle) * 60}
            x2={originX + Math.cos(angle) * (240 + ((index * 53) % 140))}
            y2={originY + Math.sin(angle) * (240 + ((index * 53) % 140))}
            stroke={accent}
            strokeWidth={2}
          />
        );
      });

    /* Branching arcs of energy. */
    case 'bolt':
      return Array.from({ length: 9 }, (_, index) => {
        const x = 20 + index * 45;
        const y = 30 + ((index * 83) % 200);
        return (
          <Path
            key={index}
            d={`M ${x} ${y}
                l 16 26 l -10 6 l 20 34 l -12 5 l 18 30`}
            stroke={accent}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        );
      });
  }
}
