/**
 * The per-exercise progress chart (FR-HP-04, FR-HP-05).
 *
 * Deliberately a small hand-drawn SVG rather than a charting library: one
 * series, one shape, no dependency to keep current. Values arrive already
 * computed by the API from `@fi/domain`, so this file only maps numbers to
 * coordinates — it never calculates a metric.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { ProgressPoint } from '@fi/shared';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';

const HEIGHT = 180;
const PADDING = { top: 12, right: 8, bottom: 22, left: 8 };

export interface ProgressChartProps {
  points: readonly ProgressPoint[];
  /** Rendered under the last value, e.g. `kg` or `reps`. */
  unitLabel: string;
  width: number;
}

interface Plotted {
  x: number;
  y: number;
  value: number;
  date: string;
}

export function ProgressChart({ points, unitLabel, width }: ProgressChartProps) {
  const theme = useTheme();

  const { plotted, path, area, min, max } = useMemo(() => {
    const values = points.map((point) => Number(point.value));
    const highest = Math.max(...values, 0);
    const lowest = Math.min(...values, highest);
    // A flat series should read as flat, not as a line through the middle of
    // an invented range.
    const span = highest - lowest || Math.max(highest * 0.1, 1);
    const top = highest + span * 0.15;
    const bottom = Math.max(0, lowest - span * 0.15);

    const innerWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const mapped: Plotted[] = points.map((point, index) => ({
      x: PADDING.left + step * index + (points.length === 1 ? innerWidth / 2 : 0),
      y:
        PADDING.top +
        innerHeight * (1 - (Number(point.value) - bottom) / Math.max(1e-6, top - bottom)),
      value: Number(point.value),
      date: point.date,
    }));

    const line = mapped
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' ');

    const firstPoint = mapped[0];
    const lastPoint = mapped[mapped.length - 1];
    const filled =
      firstPoint && lastPoint
        ? `${line} L${lastPoint.x.toFixed(1)},${HEIGHT - PADDING.bottom} L${firstPoint.x.toFixed(1)},${HEIGHT - PADDING.bottom} Z`
        : '';

    return { plotted: mapped, path: line, area: filled, min: lowest, max: highest };
  }, [points, width]);

  if (points.length === 0) {
    return (
      <View
        style={{
          height: HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceRaised,
        }}
      >
        <Text tone="faint">Log this exercise to see a trend</Text>
      </View>
    );
  }

  const last = plotted[plotted.length - 1];

  return (
    <View
      accessible
      accessibilityLabel={`Chart with ${points.length} sessions, from ${min} to ${max} ${unitLabel}`}
    >
      <Svg width={width} height={HEIGHT}>
        <Line
          x1={PADDING.left}
          y1={HEIGHT - PADDING.bottom}
          x2={width - PADDING.right}
          y2={HEIGHT - PADDING.bottom}
          stroke={theme.colors.border}
          strokeWidth={1}
        />
        {area ? <Path d={area} fill={theme.colors.accentSoft} /> : null}
        <Path
          d={path}
          stroke={theme.colors.accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {plotted.map((point) => (
          <Circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r={point === last ? 5 : 3}
            fill={point === last ? theme.colors.accent : theme.colors.background}
            stroke={theme.colors.accent}
            strokeWidth={2}
          />
        ))}
      </Svg>

      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.space.xs }}
      >
        <Text variant="caption" tone="faint">
          {plotted[0]?.date}
        </Text>
        <Text variant="caption" tone="muted">
          Latest: {last?.value.toLocaleString()} {unitLabel}
        </Text>
      </View>
    </View>
  );
}
