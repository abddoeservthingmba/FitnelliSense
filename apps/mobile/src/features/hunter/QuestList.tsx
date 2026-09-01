/**
 * The day's quests.
 *
 * A completed quest is not automatically paid: it sits there with a COLLECT
 * button, because the tap is the payoff and taking it away would make the
 * reward feel like it arrived by accident.
 */
import { Pressable, View } from 'react-native';
import type { Quest } from '@fi/shared';
import { Row, Stack } from '../../components/Card';
import { Meter } from '../../components/Section';
import { Overline, Text } from '../../components/Text';
import { SystemWindow } from '../../components/SystemWindow';
import { useTheme } from '../../theme';

export interface QuestListProps {
  quests: readonly Quest[];
  unclaimedXp: number;
  onClaim: (questId: string) => void;
  claimingId: string | null;
}

export function QuestList({ quests, unclaimedXp, onClaim, claimingId }: QuestListProps) {
  const cleared = quests.filter((quest) => quest.isComplete).length;

  return (
    <SystemWindow label="daily quests" tone={unclaimedXp > 0 ? 'alert' : 'system'}>
      <Stack gap="lg">
        <Row justify="space-between" align="flex-end">
          <Text variant="caption" tone="muted">
            {cleared} of {quests.length} cleared
          </Text>
          {unclaimedXp > 0 ? (
            <Text variant="caption" tone="accent" weight="heavy">
              +{unclaimedXp} XP waiting
            </Text>
          ) : null}
        </Row>

        <Stack gap="md">
          {quests.map((quest) => (
            <QuestRow
              key={quest.id}
              quest={quest}
              onClaim={() => onClaim(quest.id)}
              claiming={claimingId === quest.id}
            />
          ))}
        </Stack>

        {quests.length === 0 ? (
          <Text variant="caption" tone="faint">
            Quests appear at the start of each day.
          </Text>
        ) : null}
      </Stack>
    </SystemWindow>
  );
}

function QuestRow({
  quest,
  onClaim,
  claiming,
}: {
  quest: Quest;
  onClaim: () => void;
  claiming: boolean;
}) {
  const theme = useTheme();
  const collectable = quest.isComplete && !quest.isClaimed;

  return (
    <View style={{ gap: theme.space.sm }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, gap: 2, paddingRight: theme.space.sm }}>
          <Text
            variant="body"
            tone={quest.isClaimed ? 'faint' : 'default'}
            style={quest.isClaimed ? { textDecorationLine: 'line-through' } : undefined}
          >
            {quest.text}
          </Text>
          <Text variant="caption" tone="faint">
            {Math.min(quest.progress, quest.target).toLocaleString()} /{' '}
            {quest.target.toLocaleString()}
          </Text>
        </View>

        {collectable ? (
          <Pressable
            onPress={onClaim}
            disabled={claiming}
            accessibilityRole="button"
            accessibilityLabel={`Collect ${quest.xp} experience for: ${quest.text}`}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: theme.space.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.sm,
              opacity: pressed || claiming ? 0.7 : 1,
            })}
          >
            <Text
              variant="micro"
              weight="heavy"
              overline
              style={{ color: theme.colors.accentText }}
            >
              {claiming ? '…' : `+${quest.xp}`}
            </Text>
          </Pressable>
        ) : (
          <View style={{ minWidth: 56, alignItems: 'flex-end', paddingTop: 2 }}>
            <Overline tone={quest.isClaimed ? 'faint' : 'muted'}>
              {quest.isClaimed ? 'claimed' : `${quest.xp} xp`}
            </Overline>
          </View>
        )}
      </Row>

      <Meter
        progress={quest.fraction}
        tone={quest.isClaimed ? 'text' : 'accent'}
        height={4}
      />
    </View>
  );
}
