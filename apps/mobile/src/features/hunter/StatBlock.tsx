/**
 * The attribute panel.
 *
 * Three stats, each with its value, a bar, and the sentence explaining what it
 * is derived from. The explanation is not optional: a number the user cannot
 * account for is one they will eventually assume is invented.
 */
import { View } from 'react-native';
import type { HunterStatus } from '@fi/shared';
import { Row, Stack } from '../../components/Card';
import { Meter } from '../../components/Section';
import { Overline, Text } from '../../components/Text';
import { Brackets } from '../../components/SystemWindow';
import { useTheme } from '../../theme';

const STAT_KEYS = ['strength', 'endurance', 'discipline'] as const;
const STAT_LABELS = { strength: 'STR', endurance: 'END', discipline: 'DIS' } as const;

/**
 * The bar is relative to the highest of the three, so it shows the shape of a
 * hunter's build rather than pretending there is a maximum.
 */
export function StatBlock({ status }: { status: HunterStatus }) {
  const theme = useTheme();
  const peak = Math.max(1, ...STAT_KEYS.map((key) => status.stats[key]));

  return (
    <Brackets>
      <Stack gap="lg">
        <Overline>attributes</Overline>

        {STAT_KEYS.map((key) => (
          <View key={key} style={{ gap: theme.space.xs }}>
            <Row justify="space-between" align="flex-end">
              <Text variant="callout" weight="heavy" overline tone="muted">
                {STAT_LABELS[key]}
              </Text>
              <Text variant="title" tone="accent" weight="heavy">
                {status.stats[key]}
              </Text>
            </Row>
            <Meter progress={status.stats[key] / peak} height={5} />
            <Text variant="caption" tone="faint">
              {status.statSources[key]}
            </Text>
          </View>
        ))}
      </Stack>
    </Brackets>
  );
}
