/**
 * Two athletes' muscle work, side by side.
 *
 * Every group either of them trained gets a row, so a muscle you train and they
 * do not shows as a gap rather than vanishing — that asymmetry is the most
 * interesting thing on the screen.
 *
 * Both bars are scaled against the single largest figure across both people, so
 * the widths are comparable. Scaling each row to its own maximum would make
 * every row look like a close contest.
 */
import { View } from 'react-native';
import type { AthleteStats } from '@fi/shared';
import { Text } from '../../components/Text';
import { Row, Stack } from '../../components/Card';
import { Overline } from '../../components/Text';
import { useTheme } from '../../theme';
import { useUnits } from '../../lib/use-units';

export interface AthleteCompareProps {
  athlete: AthleteStats;
  you: AthleteStats | null;
}

const BAR_HEIGHT = 10;

export function AthleteCompare({ athlete, you }: AthleteCompareProps) {
  const theme = useTheme();
  const units = useUnits();

  const groups = [
    ...new Set([
      ...athlete.muscles.map((muscle) => muscle.group),
      ...(you?.muscles ?? []).map((muscle) => muscle.group),
    ]),
  ];

  const volumeIn = (stats: AthleteStats | null, group: string): number =>
    Number(stats?.muscles.find((muscle) => muscle.group === group)?.volumeKg ?? 0);

  const peak = Math.max(
    1,
    ...groups.flatMap((group) => [volumeIn(athlete, group), volumeIn(you, group)]),
  );

  // Heaviest first, by whoever did more of it — the row worth reading first.
  const ordered = [...groups].sort(
    (a, b) =>
      Math.max(volumeIn(athlete, b), volumeIn(you, b)) -
      Math.max(volumeIn(athlete, a), volumeIn(you, a)),
  );

  return (
    <Stack gap="lg">
      <Row gap="md">
        <Legend colour={theme.colors.accent} label={athlete.displayName} />
        {you === null ? null : <Legend colour={theme.colors.highlight} label="You" />}
      </Row>

      {ordered.length === 0 ? (
        <Text variant="caption" tone="muted">
          Neither of you has logged anything in this window.
        </Text>
      ) : (
        ordered.map((group) => {
          const theirs = volumeIn(athlete, group);
          const yours = volumeIn(you, group);

          return (
            <Stack key={group} gap="xs">
              <Row justify="space-between">
                <Text variant="caption" weight="semibold">
                  {group}
                </Text>
                <Text variant="micro" tone="faint">
                  {units.volume(String(theirs))}
                  {you === null ? '' : ` · you ${units.volume(String(yours))}`}
                </Text>
              </Row>

              <Bar value={theirs} peak={peak} colour={theme.colors.accent} />
              {you === null ? null : (
                <Bar value={yours} peak={peak} colour={theme.colors.highlight} />
              )}
            </Stack>
          );
        })
      )}
    </Stack>
  );
}

function Bar({ value, peak, colour }: { value: number; peak: number; colour: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: BAR_HEIGHT,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.track,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${(value / peak) * 100}%`,
          backgroundColor: colour,
          borderRadius: theme.radius.sm,
          // Real work should never render as nothing at all.
          minWidth: value > 0 ? 3 : 0,
        }}
      />
    </View>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  const theme = useTheme();
  return (
    <Row gap="xs" style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: theme.radius.sm,
          backgroundColor: colour,
        }}
      />
      <Overline>{label}</Overline>
    </Row>
  );
}
