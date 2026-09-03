/**
 * Choosing a Ascension (FR-HP-11).
 *
 * The screen's job is to make clear that this is a costume, not a class: the
 * banner says so, and every card shows the SAME six unlock levels, so you can
 * see at a glance that no Ascension levels faster than another. Someone who thinks
 * one might be stronger will pick that one over the one they actually want.
 *
 * The palette turns over the instant a card is tapped, before the profile save
 * completes. That is deliberate — the choice is a visual one, so it has to be
 * shown visually, and if the save fails the local mirror is corrected on the
 * next profile fetch.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  ASCENSIONS,
  ASCENSION_IDS,
  ascensionLadder,
  tierForLevel,
  type AscensionId,
} from '@fi/domain';
import { Card, Row, Stack } from '../src/components/Card';
import { Reveal } from '../src/components/Reveal';
import { Screen } from '../src/components/Screen';
import { Section } from '../src/components/Section';
import { Overline, Text } from '../src/components/Text';
import { useHunterStatus } from '../src/api/hooks/use-hunter';
import { useMe, useUpdateProfile } from '../src/api/hooks/use-profile';
import { useAscensionContext } from '../src/theme/ascension-context';
import { useTheme } from '../src/theme';

export default function AscensionScreen() {
  const theme = useTheme();
  const { ascensionId, setAscensionLocally } = useAscensionContext();
  const updateProfile = useUpdateProfile();
  const me = useMe();
  const status = useHunterStatus();

  // Which card is expanded to show its ladder. Only one at a time — six open
  // ladders is thirty-six rows and no way to compare them.
  const [expanded, setExpanded] = useState<AscensionId | null>(null);

  const level = status.data?.level ?? 1;

  const choose = (next: AscensionId) => {
    if (next === ascensionId) {
      setExpanded(expanded === next ? null : next);
      return;
    }
    // Local first: the whole point of the choice is the colour change.
    setAscensionLocally(next);
    updateProfile.mutate({ ascension: next });
  };

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
        <Stack gap="xs">
          <Overline>choose your ascension</Overline>
          <Text variant="heading">The same climb</Text>
          <Text variant="caption" tone="muted">
            A Ascension changes what your tiers are called and how the app looks. It changes nothing
            about how you level — every Ascension unlocks at exactly the same points, so pick the
            one you like rather than the one that sounds strongest.
          </Text>
        </Stack>

        {me.data && me.data.profile.ascension !== ascensionId && updateProfile.isPending ? (
          <Text variant="caption" tone="faint">
            Saving…
          </Text>
        ) : null}

        <Stack gap="md">
          {ASCENSION_IDS.map((id) => {
            const ascension = ASCENSIONS[id];
            const selected = id === ascensionId;
            const current = tierForLevel(ascension, level);

            return (
              <Reveal key={id} index={ASCENSION_IDS.indexOf(id)}>
                <Pressable
                  onPress={() => choose(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${ascension.name}. You would be ${current.name}.`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Card
                    style={{
                      borderColor: selected ? ascension.palette.accent : theme.colors.border,
                      borderWidth: selected ? 2 : 1,
                    }}
                  >
                    <Stack gap="md">
                      <Row gap="md" style={{ alignItems: 'center' }}>
                        {/* The Ascension's accent as the swatch — the choice is
                          largely a colour choice, so show the colour. */}
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: theme.radius.md,
                            backgroundColor: ascension.palette.background,
                            borderWidth: 2,
                            borderColor: ascension.palette.accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            weight="heavy"
                            style={{
                              color: ascension.palette.accent,
                              fontSize: theme.fontSize.callout,
                            }}
                          >
                            {ascension.name.replace(/^The /, '').slice(0, 1)}
                          </Text>
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="callout" weight="semibold">
                            {ascension.name}
                          </Text>
                          <Text variant="caption" tone="muted" numberOfLines={2}>
                            {ascension.tagline}
                          </Text>
                        </View>

                        {selected ? (
                          <Text weight="heavy" style={{ color: ascension.palette.accent }}>
                            ✓
                          </Text>
                        ) : null}
                      </Row>

                      <Row justify="space-between">
                        <Text variant="micro" tone="faint">
                          {ascension.systemLabel} · {ascension.levelWord}
                        </Text>
                        <Text variant="micro" style={{ color: ascension.palette.highlight }}>
                          you would be {current.name}
                        </Text>
                      </Row>

                      {expanded === id ? (
                        <Section title="The ladder">
                          <Stack gap="xs">
                            {ascensionLadder(ascension).map((step) => (
                              <Row key={step.tier.rank} justify="space-between">
                                <Text
                                  variant="caption"
                                  weight={step.tier.rank === current.rank ? 'semibold' : 'regular'}
                                  tone={step.tier.rank === current.rank ? 'accent' : 'muted'}
                                >
                                  {step.tier.name}
                                </Text>
                                <Text variant="micro" tone="faint">
                                  {ascension.levelWord} {step.atLevel}
                                </Text>
                              </Row>
                            ))}
                          </Stack>
                        </Section>
                      ) : selected ? (
                        <Text variant="micro" tone="faint">
                          Tap again to see the ladder.
                        </Text>
                      ) : null}
                    </Stack>
                  </Card>
                </Pressable>
              </Reveal>
            );
          })}
        </Stack>

        <Text variant="micro" tone="faint">
          Nothing you have earned changes when you switch. Your level, XP, records and history are
          the same on every Ascension.
        </Text>
      </Stack>
    </Screen>
  );
}
