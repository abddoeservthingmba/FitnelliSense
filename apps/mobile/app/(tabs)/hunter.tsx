/**
 * The Hunter tab — the System's status window.
 *
 * Reading order: who you are (level, rank), what is asked of you today
 * (quests), what you are made of (attributes), what you have proven (badges).
 * Every number on this screen is derived from logged work; none of it is
 * decoration.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Row, Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Rule, Section, Stat, StatRow } from '../../src/components/Section';
import { SystemWindow } from '../../src/components/SystemWindow';
import { Overline, Text } from '../../src/components/Text';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import {
  useBadges,
  useClaimQuest,
  useHunterStatus,
  useQuests,
} from '../../src/api/hooks/use-hunter';
import { useMe } from '../../src/api/hooks/use-profile';
import { LevelBar } from '../../src/features/hunter/LevelUpWindow';
import { QuestList } from '../../src/features/hunter/QuestList';
import { RankBadge } from '../../src/features/hunter/RankBadge';
import { StatBlock } from '../../src/features/hunter/StatBlock';
import { BadgeGrid } from '../../src/features/hunter/BadgeGrid';
import { useUnits } from '../../src/lib/use-units';
import { nextTier, tierForRank } from '@fi/domain';
import { useTheme } from '../../src/theme';

export default function HunterScreen() {
  const theme = useTheme();
  const units = useUnits();

  const me = useMe();
  const status = useHunterStatus();
  const quests = useQuests();
  const badges = useBadges();
  const claim = useClaimQuest();

  const [claimingId, setClaimingId] = useState<string | null>(null);

  if (status.isLoading) return <LoadingState label="Reading your status" />;
  if (status.isError || !status.data) {
    return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  }

  const hunter = status.data;
  // The tier this rank renders as on the chosen Ascension, and the next one up.
  const tier = tierForRank(theme.ascension, hunter.rank);
  const next = nextTier(theme.ascension, hunter.level);

  const onClaim = (questId: string) => {
    setClaimingId(questId);
    claim.mutate(questId, { onSettled: () => setClaimingId(null) });
  };

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
        {/* Identity */}
        <SystemWindow label="status" tone={hunter.rank === 'S' ? 'monarch' : 'system'}>
          <Stack gap="xl">
            <Row justify="space-between" align="center">
              <View style={{ flex: 1, gap: 2 }}>
                <Overline>{theme.ascension.systemLabel}</Overline>
                <Text variant="heading">{me.data?.profile.displayName ?? 'Unnamed'}</Text>
              </View>
              <RankBadge rank={hunter.rank} size={64} labelled />
            </Row>

            <LevelBar
              level={hunter.level}
              fraction={hunter.fraction}
              xpIntoLevel={hunter.xpIntoLevel}
              xpForThisLevel={hunter.xpForThisLevel}
            />

            {/* Named in the chosen Ascension, not as a bare letter-rank. */}
            {next ? (
              <Text variant="caption" tone="faint">
                {next.tier.name} at {theme.ascension.levelWord.toLowerCase()} {next.atLevel} —{' '}
                {next.atLevel - hunter.level} to go.
              </Text>
            ) : (
              <Text variant="caption" tone="monarch">
                {tier.blurb} There is nothing above {tier.name}.
              </Text>
            )}
          </Stack>
        </SystemWindow>

        {/* Today */}
        {quests.isLoading ? (
          <LoadingState label="Issuing quests" />
        ) : quests.data ? (
          <QuestList
            quests={quests.data.quests}
            unclaimedXp={quests.data.unclaimedXp}
            onClaim={onClaim}
            claimingId={claimingId}
          />
        ) : null}

        {/* Record */}
        <Section title="Record">
          <Stack gap="lg">
            <StatRow>
              <View style={{ flex: 1 }}>
                <Stat
                  size="medium"
                  value={String(hunter.totals.workouts)}
                  label="workouts"
                  tone="accent"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Stat
                  size="medium"
                  value={units.volume(hunter.totals.lifetimeVolumeKg)}
                  label="lifted"
                />
              </View>
            </StatRow>
            <Rule />
            <StatRow>
              <View style={{ flex: 1 }}>
                <Stat
                  size="small"
                  value={String(hunter.totals.currentStreakDays)}
                  label="day streak"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Stat
                  size="small"
                  value={String(hunter.totals.longestStreakDays)}
                  label="best streak"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Stat size="small" value={String(hunter.totals.records)} label="records" />
              </View>
            </StatRow>
          </Stack>
        </Section>

        <StatBlock status={hunter} />

        {/* Proof */}
        <Section
          title={`Badges · ${hunter.badgesEarned}/${hunter.badgesTotal}`}
          action={{ label: 'Ranking', onPress: () => router.push('/leaderboard') }}
        >
          {badges.isLoading ? (
            <LoadingState label="Opening the vault" />
          ) : badges.data ? (
            <BadgeGrid badges={badges.data.badges} />
          ) : null}
        </Section>

        <Button
          label="Global ranking"
          variant="secondary"
          onPress={() => router.push('/leaderboard')}
          fullWidth
        />
      </Stack>
    </Screen>
  );
}
