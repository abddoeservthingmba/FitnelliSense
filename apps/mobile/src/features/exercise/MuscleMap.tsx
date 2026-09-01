/**
 * A body diagram showing what an exercise works (FR-EX-04's data, made
 * legible).
 *
 * Primary muscles take the accent; secondary ones a dimmer fill. Only the views
 * that have something to show are drawn, so a chest press does not sit beside
 * an unmarked back view. The whole thing is geometry we own — see
 * `muscle-regions.ts` for why that matters.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { MuscleRole } from '@fi/shared';
import { Overline, Text } from '../../components/Text';
import { useTheme } from '../../theme';
import {
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  MUSCLE_SHAPES,
  mirrored,
  viewsFor,
  type BodyView,
  type Region,
} from './muscle-regions';

export interface MuscleMapProps {
  /** Muscle slug to its role in this exercise. */
  muscles: { slug: string; role: MuscleRole }[];
  /** Height of each figure in dp; width follows the aspect ratio. */
  height?: number;
}

/** The silhouette every view shares: head, torso, arms, legs. */
function Silhouette({ fill }: { fill: string }) {
  return (
    <G>
      <Circle cx={FIGURE_WIDTH / 2} cy={26} r={16} fill={fill} />
      {/* neck */}
      <Rect x={FIGURE_WIDTH / 2 - 7} y={38} width={14} height={10} fill={fill} />
      {/* torso, tapering to the waist */}
      <Path
        d={`M${FIGURE_WIDTH / 2 - 26},48 h52 l-4,52 q-22,10 -44,0 z`}
        fill={fill}
      />
      {/* hips */}
      <Path d={`M${FIGURE_WIDTH / 2 - 22},100 h44 l-2,24 h-40 z`} fill={fill} />
      {/* arms */}
      <Rect x={FIGURE_WIDTH / 2 + 26} y={50} width={16} height={86} rx={8} fill={fill} />
      <Rect x={FIGURE_WIDTH / 2 - 42} y={50} width={16} height={86} rx={8} fill={fill} />
      {/* legs */}
      <Rect x={FIGURE_WIDTH / 2 + 2} y={122} width={22} height={96} rx={10} fill={fill} />
      <Rect x={FIGURE_WIDTH / 2 - 24} y={122} width={22} height={96} rx={10} fill={fill} />
    </G>
  );
}

function RegionShape({ region, fill }: { region: Region; fill: string }) {
  return (
    <Rect
      x={region.x}
      y={region.y}
      width={region.w}
      height={region.h}
      rx={region.r ?? 4}
      fill={fill}
    />
  );
}

function Figure({
  view,
  highlights,
  height,
}: {
  view: BodyView;
  highlights: { slug: string; role: MuscleRole }[];
  height: number;
}) {
  const theme = useTheme();
  const width = (height * FIGURE_WIDTH) / FIGURE_HEIGHT;

  const forThisView = highlights.filter((entry) => MUSCLE_SHAPES[entry.slug]?.view === view);

  return (
    <View style={{ alignItems: 'center', gap: theme.space.sm }}>
      <Svg width={width} height={height} viewBox={`0 0 ${FIGURE_WIDTH} ${FIGURE_HEIGHT}`}>
        <Silhouette fill={theme.colors.surfaceRaised} />
        {forThisView.map((entry) => {
          const shape = MUSCLE_SHAPES[entry.slug];
          if (!shape) return null;
          const fill = entry.role === 'primary' ? theme.colors.accent : theme.colors.borderStrong;

          return (
            <G key={entry.slug}>
              {shape.regions.flatMap((region, index) => {
                const shapes = [<RegionShape key={`${index}-a`} region={region} fill={fill} />];
                if (region.mirror) {
                  shapes.push(
                    <RegionShape key={`${index}-b`} region={mirrored(region)} fill={fill} />,
                  );
                }
                return shapes;
              })}
            </G>
          );
        })}
      </Svg>
      <Overline>{view}</Overline>
    </View>
  );
}

export function MuscleMap({ muscles, height = 200 }: MuscleMapProps) {
  const theme = useTheme();

  const views = useMemo(() => viewsFor(muscles.map((entry) => entry.slug)), [muscles]);

  // Nothing mappable means nothing drawn — better an honest absence than a
  // blank body that implies the exercise works nothing.
  if (views.length === 0) return null;

  const primary = muscles.filter((entry) => entry.role === 'primary');
  const secondary = muscles.filter((entry) => entry.role === 'secondary');

  return (
    <View
      accessible
      accessibilityLabel={`Muscle diagram. Primary: ${primary.length}. Secondary: ${secondary.length}.`}
      style={{ gap: theme.space.md }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.space.xl }}>
        {views.map((view) => (
          <Figure key={view} view={view} highlights={muscles} height={height} />
        ))}
      </View>

      {/* A colour needs a key, or it is decoration rather than information. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.space.lg }}>
        <Legend colour={theme.colors.accent} label="primary" />
        {secondary.length > 0 ? (
          <Legend colour={theme.colors.borderStrong} label="secondary" />
        ) : null}
      </View>
    </View>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
      <View
        style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colour }}
      />
      <Text variant="micro" tone="muted" overline weight="heavy">
        {label}
      </Text>
    </View>
  );
}
