/**
 * Training insights (FR-AI-04).
 *
 * The comparison is the feature: this window against the one before it, muscle
 * group by muscle group. A single window's totals are trivia; the change is
 * what a training log exists to tell you.
 *
 * Every figure comes from `@fi/domain` via the API. Nothing here calculates,
 * and no model is involved — the numbers are the insight.
 */
import { useState } from 'react';
import { View } from 'react-native';
import type { InsightsWindow } from '@fi/shared';
import { Card, Stack } from '../src/components/Card';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { Rule, Section, Stat, StatRow } from '../src/components/Section';
import { Overline, Text } from '../src/components/Text';
import { ErrorState, LoadingState } from '../src/components/StateViews';
import { MuscleBars } from '../src/features/insights/MuscleBars';
import { useTrainingInsights } from '../src/api/hooks/use-insights';
import { useUnits } from '../src/lib/use-units';
import { useTheme } from '../src/theme';

const WINDOWS: { value: InsightsWindow; label: string }[] = [
  { value: '14d', label: '2 weeks' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function InsightsScreen() {
  const theme = useTheme();
  const units = useUnits();
  const [window, setWindow] = useState<InsightsWindow>('30d');
  const insights = useTrainingInsights(window);

  if (insights.isLoading) return <LoadingState label="Working it out" />;
  if (insights.isError || !insights.data) {
    return <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />;
  }

  const data = insights.data;
  const totals = data.totals;
  const volumeDelta = Number(totals.volumeKg) - Number(totals.previousVolumeKg);

  return (
    <Screen scroll footerSpace={40}>
      <Stack gap="xxl" style={{ paddingTop: theme.space.lg }}>
        <Stack gap="sm">
          <Overline>compared with the previous period</Overline>
          <Text variant="heading">Training insights</Text>
          <Text variant="caption" tone="faint">
            {data.from} to {data.to}, against {data.previousFrom} to {data.previousTo}
          </Text>
        </Stack>

        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {WINDOWS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={window === option.value}
              onPress={() => setWindow(option.value)}
            />
          ))}
        </View>

        {!data.hasEnoughData ? (
          <Card>
            <Stack gap="sm">
              <Text variant="callout" weight="semibold">
                Not enough logged yet
              </Text>
              <Text variant="caption" tone="muted">
                A comparison needs at least two sessions in the window. Keep logging and this fills
                in on its own — nothing to set up.
              </Text>
            </Stack>
          </Card>
        ) : null}

        {/* The headline three, each against its own previous figure. */}
        <Section title="This period">
          <StatRow>
            <View style={{ flex: 1 }}>
              <Stat
                size="large"
                value={units.volume(totals.volumeKg).replace(/\s\w+$/, '')}
                label={`${units.label} moved`}
                tone="accent"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Stat size="large" value={String(totals.workouts)} label="sessions" />
            </View>
            <View style={{ flex: 1 }}>
              <Stat size="large" value={String(totals.sets)} label="sets" />
            </View>
          </StatRow>

          <Rule />

          <Text variant="caption" tone={volumeDelta >= 0 ? 'success' : 'warning'}>
            {volumeDelta >= 0 ? '▲' : '▼'} {units.volume(String(Math.abs(volumeDelta)))} on the
            previous {WINDOWS.find((w) => w.value === window)?.label} · {totals.previousWorkouts}{' '}
            sessions, {totals.previousSets} sets
          </Text>
        </Section>

        {data.muscles.length > 0 ? (
          <Section title="By muscle group">
            <Stack gap="md">
              <MuscleBars muscles={data.muscles} />
              <Text variant="micro" tone="faint">
                Primary muscles only, and volume is split between an exercise’s primary groups — so
                a bench press counts as chest, not as arms, and the group totals still add up to
                what you actually lifted.
              </Text>
            </Stack>
          </Section>
        ) : null}

        {data.insights.length > 0 ? (
          <Section title="Worth noticing">
            <Stack gap="sm">
              {data.insights.map((insight) => (
                <Card key={`${insight.type}-${insight.title}`}>
                  <Stack gap="xs">
                    <Overline tone={insight.type === 'plateau' ? 'warning' : 'accent'}>
                      {insight.type}
                    </Overline>
                    <Text variant="callout" weight="semibold">
                      {insight.title}
                    </Text>
                    <Text variant="micro" tone="faint">
                      {insight.basis}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Section>
        ) : null}

        <Text variant="micro" tone="faint">
          Worked out on your own logged sets. Nothing is sent anywhere, and no model is involved —
          these are your numbers, counted.
        </Text>
      </Stack>
    </Screen>
  );
}
