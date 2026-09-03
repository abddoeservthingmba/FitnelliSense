/**
 * Another athlete's profile — FR-LB-08.
 *
 * Reachable only from the leaderboard, and only for people who opted into it.
 * Anyone else 404s, which this screen states as a fact about sharing rather
 * than as an error, because it is not one.
 *
 * What is shown is what the opt-in covers: training. No bodyweight, no
 * nutrition, no session dates, no email.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ascensionFor, tierForRank } from '@fi/domain';
import type { AthleteStats } from '@fi/shared';
import { Card, Row, Stack as Column } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { Screen } from '../../src/components/Screen';
import { Section, Stat, StatRow } from '../../src/components/Section';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/StateViews';
import { Overline, Text } from '../../src/components/Text';
import { AthleteCompare } from '../../src/features/hunter/AthleteCompare';
import { RankBadge } from '../../src/features/hunter/RankBadge';
import { useAthlete } from '../../src/api/hooks/use-hunter';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

const WINDOWS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
] as const;

const PR_LABEL: Record<string, string> = {
  heaviest_weight: 'heaviest',
  best_1rm: 'est. 1RM',
  best_set_volume: 'best set',
};

export default function AthleteScreen() {
  const theme = useTheme();
  const units = useUnits();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [window, setWindow] = useState<'week' | 'month' | 'all'>('month');
  const profile = useAthlete(id, window);

  if (profile.isLoading) return <LoadingState />;

  // A 404 here means "not sharing", which is a choice, not a failure. Showing
  // it as an error with a Retry button would invite someone to hammer it.
  if (profile.isError || !profile.data) {
    const notShared = (profile.error as { status?: number } | null)?.status === 404;
    return notShared ? (
      <Screen>
        <EmptyState
          title="Not sharing a profile"
          body="This athlete has not turned on the leaderboard, so there is nothing to show."
        />
      </Screen>
    ) : (
      <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
    );
  }

  const { athlete, you } = profile.data;

  return (
    <>
      <Stack.Screen options={{ title: athlete.displayName, headerShown: true }} />
      <Screen scroll>
        <Column gap="xxl" style={{ paddingTop: theme.space.lg }}>
          <Row gap="lg" style={{ alignItems: 'center' }}>
            <RankBadge rank={athlete.hunterRank} size={64} ascension={athlete.ascension} />
            <View style={{ flex: 1, gap: 2 }}>
              <Overline>
                {tierForRank(ascensionFor(athlete.ascension), athlete.hunterRank).name}
              </Overline>
              <Text variant="heading" numberOfLines={1}>
                {athlete.displayName}
              </Text>
              <Text variant="caption" tone="faint">
                Level {athlete.level} · {athlete.totalXp.toLocaleString()} XP
              </Text>
            </View>
          </Row>

          <Row gap="sm" wrap>
            {WINDOWS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={window === option.value}
                onPress={() => setWindow(option.value)}
              />
            ))}
          </Row>

          <StatRow>
            <View style={{ flex: 1 }}>
              <Stat size="small" value={`${athlete.workouts}`} label="workouts" />
            </View>
            <View style={{ flex: 1 }}>
              <Stat size="small" value={units.volume(athlete.volumeKg)} label="volume" />
            </View>
            <View style={{ flex: 1 }}>
              <Stat size="small" value={`${athlete.sets}`} label="sets" />
            </View>
          </StatRow>

          {you === null ? null : <Headline athlete={athlete} you={you} />}

          <Section title="Muscle by muscle">
            <AthleteCompare athlete={athlete} you={you} />
          </Section>

          <Section title="Personal records">
            {athlete.records.length === 0 ? (
              <Text variant="caption" tone="muted">
                No records logged yet.
              </Text>
            ) : (
              <Column gap="sm">
                {athlete.records.map((record, index) => (
                  <Card key={`${record.exerciseName}-${record.prType}-${index}`}>
                    <Row justify="space-between" style={{ alignItems: 'center' }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="callout" weight="semibold" numberOfLines={1}>
                          {record.exerciseName}
                        </Text>
                        <Text variant="caption" tone="faint">
                          {PR_LABEL[record.prType] ?? record.prType}
                          {record.reps === null ? '' : ` · ${record.reps} reps`}
                        </Text>
                      </View>
                      <Text variant="callout" tone="highlight" weight="heavy">
                        {units.weight(record.value)}
                      </Text>
                    </Row>
                  </Card>
                ))}
              </Column>
            )}
          </Section>

          <Text variant="micro" tone="faint">
            Training only. Bodyweight, food and session notes are never shared.
          </Text>
        </Column>
      </Screen>
    </>
  );
}

/** One line on where the viewer stands, from figures already computed. */
function Headline({ athlete, you }: { athlete: AthleteStats; you: AthleteStats }) {
  const theirs = Number(athlete.volumeKg);
  const yours = Number(you.volumeKg);

  const line =
    yours === 0 && theirs === 0
      ? 'Neither of you has logged anything in this window.'
      : yours > theirs
        ? `You are ahead on volume this window.`
        : yours === theirs
          ? 'Dead level on volume this window.'
          : theirs > 0
            ? `${athlete.displayName} is ahead on volume by ${Math.round(((theirs - yours) / theirs) * 100)}%.`
            : 'You are ahead on volume this window.';

  return (
    <Card>
      <Text variant="callout">{line}</Text>
    </Card>
  );
}
