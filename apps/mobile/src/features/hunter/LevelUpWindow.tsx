/**
 * The level-up notification.
 *
 * The payoff moment, so it gets the full treatment: a System window that
 * animates in, the old level crossed out by the new one, and the itemised XP
 * beneath — because a reward you cannot account for stops feeling earned.
 *
 * It only appears when something actually happened. A workout that levelled
 * nothing shows the ordinary summary; inventing a celebration for routine work
 * is how gamification starts feeling like flattery.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, ScrollView, View } from 'react-native';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { HunterReward } from '@fi/shared';
import { Button } from '../../components/Button';
import { Row, Stack } from '../../components/Card';
import { Brackets, SystemWindow } from '../../components/SystemWindow';
import { Meter } from '../../components/Section';
import { Overline, Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { RankBadge } from './RankBadge';

export interface LevelUpWindowProps {
  visible: boolean;
  reward: HunterReward | null;
  onClose: () => void;
}

export function LevelUpWindow({ visible, reward, onClose }: LevelUpWindowProps) {
  const theme = useTheme();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Animated.timing(entrance, {
      toValue: 1,
      duration: theme.duration.reveal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, entrance, theme.duration.reveal]);

  if (!reward) return null;

  const monarch = reward.rankAfter === 'S';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: 'center',
          padding: theme.space.lg,
        }}
      >
        <Animated.View
          style={{
            opacity: entrance,
            transform: [
              { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            ],
          }}
        >
          <SystemWindow label="system" tone={monarch ? 'monarch' : 'alert'}>
            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              <Stack gap="xl">
                <Stack gap="xs" style={{ alignItems: 'center' }}>
                  <Overline tone={monarch ? 'monarch' : 'accent'}>
                    {reward.rankedUp ? 'rank up' : 'level up'}
                  </Overline>

                  <Row gap="lg" align="center">
                    <Text variant="hero" tone="faint">
                      {reward.levelBefore}
                    </Text>
                    <Text variant="display" tone={monarch ? 'monarch' : 'accent'}>
                      ›
                    </Text>
                    <Text variant="hero" tone={monarch ? 'monarch' : 'accent'}>
                      {reward.levelAfter}
                    </Text>
                  </Row>
                </Stack>

                {reward.rankedUp ? (
                  <Row gap="xl" justify="center" align="center">
                    <RankBadge rank={reward.rankBefore} size={44} />
                    <Text variant="title" tone="faint">
                      ›
                    </Text>
                    <RankBadge rank={reward.rankAfter} size={64} />
                  </Row>
                ) : null}

                <XpLedger reward={reward} />

                <StatDelta reward={reward} />

                {reward.badgesEarned.length > 0 ? (
                  <Stack gap="sm">
                    <Overline tone="highlight">
                      {reward.badgesEarned.length === 1 ? 'badge earned' : 'badges earned'}
                    </Overline>
                    {reward.badgesEarned.map((badge) => (
                      <Row key={badge.key} justify="space-between">
                        <Text variant="callout" weight="semibold" tone="highlight">
                          {badge.name}
                        </Text>
                        <Text variant="caption" tone="faint">
                          +{badge.xp} XP
                        </Text>
                      </Row>
                    ))}
                  </Stack>
                ) : null}

                {reward.questsCompleted.length > 0 ? (
                  <Stack gap="sm">
                    <Overline tone="accent">quests cleared</Overline>
                    {reward.questsCompleted.map((quest) => (
                      <Row key={quest.id} justify="space-between">
                        <Text variant="body">{quest.text}</Text>
                        <Text variant="caption" tone="accent">
                          +{quest.xp} XP
                        </Text>
                      </Row>
                    ))}
                    <Text variant="caption" tone="faint">
                      Collect them on the Hunter tab.
                    </Text>
                  </Stack>
                ) : null}

                <Button
                  label="Acknowledge"
                  onPress={onClose}
                  variant={monarch ? 'primary' : 'accent'}
                  size="large"
                  fullWidth
                  haptic
                />
              </Stack>
            </ScrollView>
          </SystemWindow>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The XP itemisation. Zero terms are omitted rather than shown as +0. */
function XpLedger({ reward }: { reward: HunterReward }) {
  const theme = useTheme();
  const { xp } = reward;

  const lines: { label: string; value: number }[] = [
    { label: 'session', value: xp.session },
    { label: 'volume', value: xp.volume },
    { label: 'sets', value: xp.sets },
    { label: 'records', value: xp.records },
    { label: `streak ×${xp.streakMultiplier}`, value: xp.streakBonus },
  ].filter((line) => line.value > 0);

  return (
    <Brackets>
      <Stack gap="sm">
        <Overline>experience</Overline>
        {lines.map((line) => (
          <Row key={line.label} justify="space-between">
            <Text variant="caption" tone="muted">
              {line.label}
            </Text>
            <Text variant="caption" tone="muted">
              +{line.value}
            </Text>
          </Row>
        ))}
        <View style={{ height: 1, backgroundColor: theme.colors.border }} />
        <Row justify="space-between" align="flex-end">
          <Overline tone="accent">total</Overline>
          <Text variant="metric" tone="accent">
            +{xp.total}
          </Text>
        </Row>
      </Stack>
    </Brackets>
  );
}

/** Stat movement, shown only for the stats that actually moved. */
function StatDelta({ reward }: { reward: HunterReward }) {
  const keys = ['strength', 'endurance', 'discipline'] as const;
  const moved = keys.filter((key) => reward.statsAfter[key] !== reward.statsBefore[key]);

  if (moved.length === 0) return null;

  return (
    <Stack gap="sm">
      <Overline>attributes</Overline>
      {moved.map((key) => {
        const delta = reward.statsAfter[key] - reward.statsBefore[key];
        return (
          <Row key={key} justify="space-between">
            <Text variant="caption" tone="muted" overline weight="heavy">
              {key}
            </Text>
            <Row gap="sm">
              <Text variant="caption" tone="faint">
                {reward.statsBefore[key]}
              </Text>
              <Text variant="caption" tone="accent">
                ›
              </Text>
              <Text variant="caption" tone="accent" weight="heavy">
                {reward.statsAfter[key]}
              </Text>
              <Text variant="caption" tone={delta > 0 ? 'accent' : 'faint'}>
                ({delta > 0 ? '+' : ''}
                {delta})
              </Text>
            </Row>
          </Row>
        );
      })}
    </Stack>
  );
}

/** The level bar, reused on the status screen and after a claim. */
export function LevelBar({
  level,
  fraction,
  xpIntoLevel,
  xpForThisLevel,
}: {
  level: number;
  fraction: number;
  xpIntoLevel: number;
  xpForThisLevel: number;
}) {
  const theme = useTheme();

  return (
    <Stack gap="sm">
      <Row justify="space-between" align="flex-end">
        <Row gap="sm" align="flex-end">
          <Overline>level</Overline>
          <Text variant="metric" tone="accent">
            {level}
          </Text>
        </Row>
        <Text variant="caption" tone="faint">
          {xpIntoLevel.toLocaleString()} / {xpForThisLevel.toLocaleString()} XP
        </Text>
      </Row>
      <Meter progress={fraction} height={8} />
      <Text variant="caption" tone="faint">
        {Math.max(0, xpForThisLevel - xpIntoLevel).toLocaleString()} XP to level {level + 1}
      </Text>
      <View style={{ height: theme.space.xs }} />
    </Stack>
  );
}
