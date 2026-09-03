/**
 * The global ranking.
 *
 * Opt-in only, and the screen is honest about what opting in publishes. A
 * viewer who has not opted in can see the board but is absent from it, and the
 * panel explaining that is the first thing they see rather than a footnote —
 * workout data is health-adjacent (BRD R2), so this is not a toggle to bury.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { LeaderboardEntry } from '@fi/shared';
import { useLeaderboard } from '../src/api/hooks/use-hunter';
import { useMe, useUpdateProfile } from '../src/api/hooks/use-profile';
import { Button } from '../src/components/Button';
import { Row, Stack } from '../src/components/Card';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { Rule } from '../src/components/Section';
import { SystemWindow } from '../src/components/SystemWindow';
import { Overline, Text } from '../src/components/Text';
import { EmptyState, ErrorState, LoadingState } from '../src/components/StateViews';
import { RankBadge } from '../src/features/hunter/RankBadge';
import { useUnits } from '../src/lib/use-units';
import { useTheme } from '../src/theme';

const WINDOWS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All time' },
] as const;

export default function LeaderboardScreen() {
  const theme = useTheme();
  const units = useUnits();
  const me = useMe();
  const updateProfile = useUpdateProfile();

  const [window, setWindow] = useState<'week' | 'month' | 'all'>('week');
  const board = useLeaderboard(window);

  const optedIn = me.data?.profile.leaderboardOptIn ?? false;

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
        <Stack gap="xs">
          <Overline>global</Overline>
          <Text variant="heading">Ranking</Text>
        </Stack>

        {/* The consent panel leads, and says exactly what is published. */}
        {!optedIn ? (
          <SystemWindow label="not listed" tone="quiet">
            <Stack gap="md">
              <Text variant="callout" weight="semibold">
                You are not on the board.
              </Text>
              <Text variant="caption" tone="muted">
                Joining publishes your display name, level, rank, XP, total volume and workout count
                to everyone else who has joined — and lets them open your profile to see your
                personal records and which muscle groups you train.
              </Text>
              <Text variant="caption" tone="muted">
                It does not publish your bodyweight, what you eat, your session notes, or when you
                trained. You can leave at any time.
              </Text>
              <Button
                label="Join the ranking"
                onPress={() => updateProfile.mutate({ leaderboardOptIn: true })}
                loading={updateProfile.isPending}
                variant="accent"
                fullWidth
              />
            </Stack>
          </SystemWindow>
        ) : null}

        <Row gap="sm">
          {WINDOWS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={window === option.value}
              onPress={() => setWindow(option.value)}
            />
          ))}
        </Row>

        {board.isLoading ? (
          <LoadingState label="Reading the ranking" />
        ) : board.isError ? (
          <ErrorState error={board.error} onRetry={() => void board.refetch()} />
        ) : board.data && board.data.entries.length === 0 ? (
          <EmptyState
            title="Nobody has joined yet"
            body="The ranking fills up as hunters opt in."
          />
        ) : (
          <View>
            {board.data?.entries.map((entry, index) => (
              <View key={entry.userId}>
                {index > 0 ? <Rule /> : null}
                <LeaderboardRow entry={entry} volumeLabel={units.volume(entry.volumeKg)} />
              </View>
            ))}
          </View>
        )}

        {optedIn ? (
          <Button
            label="Leave the ranking"
            variant="ghost"
            onPress={() => updateProfile.mutate({ leaderboardOptIn: false })}
            fullWidth
          />
        ) : null}
      </Stack>
    </Screen>
  );
}

function LeaderboardRow({ entry, volumeLabel }: { entry: LeaderboardEntry; volumeLabel: string }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push(`/athlete/${entry.userId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${entry.isYou ? 'Your' : entry.displayName + "'s"} profile`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        paddingVertical: theme.space.md,
        // Your own row is marked, so the board is scannable for the only entry
        // most people are looking for.
        backgroundColor: entry.isYou ? theme.colors.accentSoft : 'transparent',
        paddingHorizontal: entry.isYou ? theme.space.sm : 0,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="title" tone={entry.isYou ? 'accent' : 'faint'} style={{ width: 34 }}>
        {entry.rank}
      </Text>

      <RankBadge rank={entry.hunterRank} size={36} />

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="semibold" numberOfLines={1}>
          {entry.isYou ? 'You' : entry.displayName}
        </Text>
        <Text variant="caption" tone="faint">
          Lv {entry.level} · {volumeLabel} · {entry.workouts} workout
          {entry.workouts === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="callout" tone="accent" weight="heavy">
          {entry.totalXp.toLocaleString()}
        </Text>
        <Overline>xp</Overline>
      </View>

      <Text variant="callout" tone="faint">
        ›
      </Text>
    </Pressable>
  );
}
