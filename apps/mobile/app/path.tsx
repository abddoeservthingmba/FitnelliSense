/**
 * Choosing a Path (FR-HP-11).
 *
 * The screen's job is to make clear that this is a costume, not a class: the
 * banner says so, and every card shows the SAME six unlock levels, so you can
 * see at a glance that no Path levels faster than another. Someone who thinks
 * one might be stronger will pick that one over the one they actually want.
 *
 * The palette turns over the instant a card is tapped, before the profile save
 * completes. That is deliberate — the choice is a visual one, so it has to be
 * shown visually, and if the save fails the local mirror is corrected on the
 * next profile fetch.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PATHS, PATH_IDS, pathLadder, tierForLevel, type PathId } from '@fi/domain';
import { Card, Row, Stack } from '../src/components/Card';
import { Reveal } from '../src/components/Reveal';
import { Screen } from '../src/components/Screen';
import { Section } from '../src/components/Section';
import { Overline, Text } from '../src/components/Text';
import { useHunterStatus } from '../src/api/hooks/use-hunter';
import { useMe, useUpdateProfile } from '../src/api/hooks/use-profile';
import { usePathContext } from '../src/theme/path-context';
import { useTheme } from '../src/theme';

export default function PathScreen() {
  const theme = useTheme();
  const { pathId, setPathLocally } = usePathContext();
  const updateProfile = useUpdateProfile();
  const me = useMe();
  const status = useHunterStatus();

  // Which card is expanded to show its ladder. Only one at a time — six open
  // ladders is thirty-six rows and no way to compare them.
  const [expanded, setExpanded] = useState<PathId | null>(null);

  const level = status.data?.level ?? 1;

  const choose = (next: PathId) => {
    if (next === pathId) {
      setExpanded(expanded === next ? null : next);
      return;
    }
    // Local first: the whole point of the choice is the colour change.
    setPathLocally(next);
    updateProfile.mutate({ progressionPath: next });
  };

  return (
    <Screen scroll>
      <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
        <Stack gap="xs">
          <Overline>choose your path</Overline>
          <Text variant="heading">The same climb</Text>
          <Text variant="caption" tone="muted">
            A Path changes what your tiers are called and how the app looks. It changes nothing
            about how you level — every Path unlocks at exactly the same points, so pick the one you
            like rather than the one that sounds strongest.
          </Text>
        </Stack>

        {me.data && me.data.profile.progressionPath !== pathId && updateProfile.isPending ? (
          <Text variant="caption" tone="faint">
            Saving…
          </Text>
        ) : null}

        <Stack gap="md">
          {PATH_IDS.map((id) => {
            const path = PATHS[id];
            const selected = id === pathId;
            const current = tierForLevel(path, level);

            return (
              <Reveal key={id} index={PATH_IDS.indexOf(id)}>
                <Pressable
                  onPress={() => choose(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${path.name}. You would be ${current.name}.`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Card
                    style={{
                      borderColor: selected ? path.palette.accent : theme.colors.border,
                      borderWidth: selected ? 2 : 1,
                    }}
                  >
                    <Stack gap="md">
                      <Row gap="md" style={{ alignItems: 'center' }}>
                        {/* The Path's accent as the swatch — the choice is
                          largely a colour choice, so show the colour. */}
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: theme.radius.md,
                            backgroundColor: path.palette.background,
                            borderWidth: 2,
                            borderColor: path.palette.accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            weight="heavy"
                            style={{ color: path.palette.accent, fontSize: theme.fontSize.callout }}
                          >
                            {path.name.replace(/^The /, '').slice(0, 1)}
                          </Text>
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="callout" weight="semibold">
                            {path.name}
                          </Text>
                          <Text variant="caption" tone="muted" numberOfLines={2}>
                            {path.tagline}
                          </Text>
                        </View>

                        {selected ? (
                          <Text weight="heavy" style={{ color: path.palette.accent }}>
                            ✓
                          </Text>
                        ) : null}
                      </Row>

                      <Row justify="space-between">
                        <Text variant="micro" tone="faint">
                          {path.systemLabel} · {path.levelWord}
                        </Text>
                        <Text variant="micro" style={{ color: path.palette.highlight }}>
                          you would be {current.name}
                        </Text>
                      </Row>

                      {expanded === id ? (
                        <Section title="The ladder">
                          <Stack gap="xs">
                            {pathLadder(path).map((step) => (
                              <Row key={step.tier.rank} justify="space-between">
                                <Text
                                  variant="caption"
                                  weight={step.tier.rank === current.rank ? 'semibold' : 'regular'}
                                  tone={step.tier.rank === current.rank ? 'accent' : 'muted'}
                                >
                                  {step.tier.name}
                                </Text>
                                <Text variant="micro" tone="faint">
                                  {path.levelWord} {step.atLevel}
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
          the same on every Path.
        </Text>
      </Stack>
    </Screen>
  );
}
