/**
 * Volume by muscle group, this window against the last.
 *
 * Two bars per group: the current window solid, the previous one behind it as
 * an outline. That comparison is the whole point — "6,000 kg of chest work"
 * means little, "6,000 kg, up from 5,000" means something.
 *
 * Hand-drawn like `ProgressChart` rather than pulled from a charting library:
 * two rectangles and a label do not justify a dependency, and every number
 * arrives already computed by `@fi/domain`, so this file only maps values to
 * pixels.
 */
import { View } from 'react-native';
import type { MuscleChange } from '@fi/shared';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { useUnits } from '../../lib/use-units';

export interface MuscleBarsProps {
  muscles: readonly MuscleChange[];
}

const ROW_HEIGHT = 26;
const PREVIOUS_HEIGHT = 8;

export function MuscleBars({ muscles }: MuscleBarsProps) {
  const theme = useTheme();
  const units = useUnits();

  // Scaled against the largest figure in *either* window, so a group that
  // halved still reads as having halved rather than refilling the row.
  const peak = Math.max(
    1,
    ...muscles.map((muscle) => Math.max(Number(muscle.volumeKg), Number(muscle.previousVolumeKg))),
  );

  return (
    <View style={{ gap: theme.space.md }}>
      {muscles.map((muscle) => {
        const current = Number(muscle.volumeKg);
        const previous = Number(muscle.previousVolumeKg);
        const delta = Number(muscle.deltaVolumeKg);

        return (
          <View key={muscle.group} style={{ gap: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="caption" weight="semibold">
                {muscle.group}
              </Text>
              <Text variant="caption" tone={changeTone(delta)}>
                {formatChange(muscle, units.volume(muscle.deltaVolumeKg))}
              </Text>
            </View>

            <View style={{ height: ROW_HEIGHT, justifyContent: 'center' }}>
              {/* The previous window, behind — an outline so it reads as
                  context rather than competing with the current figure. */}
              <View
                style={{
                  position: 'absolute',
                  height: PREVIOUS_HEIGHT,
                  width: `${(previous / peak) * 100}%`,
                  bottom: 0,
                  borderWidth: 1,
                  borderColor: theme.colors.borderStrong,
                  borderRadius: theme.radius.sm,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  height: ROW_HEIGHT - PREVIOUS_HEIGHT - 2,
                  width: `${(current / peak) * 100}%`,
                  top: 0,
                  backgroundColor: theme.colors.accent,
                  borderRadius: theme.radius.sm,
                  // A group with real volume should never render as invisible.
                  minWidth: current > 0 ? 3 : 0,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="micro" tone="faint">
                {units.volume(muscle.volumeKg)} · {muscle.sets} sets · {muscle.workouts}{' '}
                {muscle.workouts === 1 ? 'session' : 'sessions'}
              </Text>
              <Text variant="micro" tone="faint">
                was {units.volume(muscle.previousVolumeKg)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function changeTone(delta: number): 'success' | 'warning' | 'faint' {
  if (delta > 0) return 'success';
  if (delta < 0) return 'warning';
  return 'faint';
}

/**
 * The change, as a percentage where one is meaningful and an absolute
 * otherwise.
 *
 * `changePercent` is null when the previous window held too little to compare
 * against — a group trained for the first time, or from a base so small the
 * percentage would be theatre. Showing "+4900%" there would be arithmetically
 * true and useless, so the absolute figure stands alone.
 */
function formatChange(muscle: MuscleChange, absolute: string): string {
  if (muscle.changePercent === null) {
    return Number(muscle.deltaVolumeKg) > 0 ? `new · +${absolute}` : absolute;
  }
  const sign = muscle.changePercent > 0 ? '+' : '';
  return `${sign}${muscle.changePercent}%`;
}
