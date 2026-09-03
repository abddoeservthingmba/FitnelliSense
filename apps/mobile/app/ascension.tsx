/**
 * Choosing an Ascension (FR-HP-11).
 *
 * Two modes from one screen. Reached with `?first=1` it is the gate a new
 * account passes through before the app opens — no header, no way back, a
 * choice required. Reached from Profile it is an ordinary settings screen.
 *
 * They share everything except the framing, because the content is identical
 * and two screens showing the same five cards would drift apart within a week.
 *
 * The screen's job is to make clear this is a costume, not a class: every card
 * shows the SAME six unlock levels. Somebody who suspects one Ascension levels
 * faster will pick that one over the one they actually want.
 *
 * The palette turns over the instant a card is tapped, before the save
 * completes — the choice is a visual one, so it has to be answered visually.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  ASCENSIONS,
  ASCENSION_IDS,
  ascensionLadder,
  quoteFor,
  tierForLevel,
  type AscensionId,
} from '@fi/domain';
import { Button } from '../src/components/Button';
import { Card, Row, Stack as Column } from '../src/components/Card';
import { Reveal } from '../src/components/Reveal';
import { Screen } from '../src/components/Screen';
import { Section } from '../src/components/Section';
import { Overline, Text } from '../src/components/Text';
import { AscensionSigil } from '../src/features/ascension/AscensionSigil';
import { TierMark } from '../src/features/ascension/TierMark';
import { useHunterStatus } from '../src/api/hooks/use-hunter';
import { useMe, useUpdateProfile } from '../src/api/hooks/use-profile';
import { useAscensionContext } from '../src/theme/ascension-context';
import { useTheme } from '../src/theme';

export default function AscensionScreen() {
  const theme = useTheme();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const isFirstRun = first === '1';

  const { ascensionId, setAscensionLocally } = useAscensionContext();
  const updateProfile = useUpdateProfile();
  const me = useMe();
  const status = useHunterStatus();

  const [expanded, setExpanded] = useState<AscensionId | null>(null);
  const level = status.data?.level ?? 1;
  const chosen = me.data?.profile.ascension ?? null;

  const choose = (next: AscensionId) => {
    if (next === ascensionId && !isFirstRun) {
      setExpanded(expanded === next ? null : next);
      return;
    }
    // Local first: the whole point of the choice is the colour change.
    setAscensionLocally(next);
    updateProfile.mutate({ ascension: next });
  };

  return (
    <>
      {/* No header and no gesture back on first run: there is nothing behind
          this screen to go back to, and a dismissable required choice is just
          a bug waiting to be filed. */}
      <Stack.Screen
        options={
          isFirstRun
            ? { headerShown: false, gestureEnabled: false }
            : { headerShown: true, title: 'Your Ascension' }
        }
      />

      <Screen scroll>
        <Column gap="xl" style={{ paddingTop: theme.space.xl }}>
          {isFirstRun ? (
            <Column gap="md" style={{ alignItems: 'center' }}>
              <AscensionSigil size={110} />
              <Column gap="xs" style={{ alignItems: 'center' }}>
                <Overline>choose your ascension</Overline>
                <Text variant="heading" style={{ textAlign: 'center' }}>
                  Who are you climbing as?
                </Text>
                <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                  This sets what your tiers are called and how the app looks. It changes nothing
                  about how you level, and you can change it whenever you like.
                </Text>
              </Column>
            </Column>
          ) : (
            <Column gap="xs">
              <Overline>your ascension</Overline>
              <Text variant="heading">The same climb</Text>
              <Text variant="caption" tone="muted">
                Every Ascension unlocks at exactly the same points, so pick the one you like rather
                than the one that sounds strongest.
              </Text>
            </Column>
          )}

          <Column gap="md">
            {ASCENSION_IDS.map((id) => {
              const ascension = ASCENSIONS[id];
              const selected = id === ascensionId && (chosen !== null || !isFirstRun);
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
                      <Column gap="md">
                        <Row gap="md" style={{ alignItems: 'center' }}>
                          {/* The mark of the tier you would currently be on
                              this Ascension — the choice made concrete. */}
                          <TierMark tier={current} motif={ascension.motif} size={56} />

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

                        {/* A line in that Ascension's voice, so the choice is
                            heard as well as seen. */}
                        <Text
                          variant="caption"
                          style={{ color: ascension.palette.highlight, fontStyle: 'italic' }}
                        >
                          “{quoteFor(id, 'home', id)}”
                        </Text>

                        <Row justify="space-between">
                          <Text variant="micro" tone="faint">
                            {ascension.systemLabel} · {ascension.levelWord}
                          </Text>
                          <Text variant="micro" tone="faint">
                            you would be {current.name}
                          </Text>
                        </Row>

                        {expanded === id ? (
                          <Section title="The ladder">
                            <Column gap="xs">
                              {ascensionLadder(ascension).map((step) => (
                                <Row
                                  key={step.tier.rank}
                                  justify="space-between"
                                  style={{ alignItems: 'center' }}
                                >
                                  {/* Each tier's own mark, so the ladder shows
                                      the six icons rather than six names. */}
                                  <Row gap="sm" style={{ alignItems: 'center', flex: 1 }}>
                                    <TierMark tier={step.tier} motif={ascension.motif} size={30} />
                                    <Text
                                      variant="caption"
                                      weight={
                                        step.tier.rank === current.rank ? 'semibold' : 'regular'
                                      }
                                      tone={step.tier.rank === current.rank ? 'accent' : 'muted'}
                                    >
                                      {step.tier.name}
                                    </Text>
                                  </Row>
                                  <Text variant="micro" tone="faint">
                                    {ascension.levelWord} {step.atLevel}
                                  </Text>
                                </Row>
                              ))}
                            </Column>
                          </Section>
                        ) : selected && !isFirstRun ? (
                          <Text variant="micro" tone="faint">
                            Tap again to see the ladder.
                          </Text>
                        ) : null}
                      </Column>
                    </Card>
                  </Pressable>
                </Reveal>
              );
            })}
          </Column>

          {isFirstRun ? (
            <Column gap="sm">
              {/*
                Enabled only once the choice has reached the server. Letting
                someone through on the optimistic local value would drop them
                back onto this screen on their next launch, because the gate
                reads the profile.
              */}
              <Button
                label={chosen === null ? 'Choose one to continue' : 'Begin'}
                onPress={() => router.replace('/(tabs)')}
                disabled={chosen === null}
                loading={updateProfile.isPending}
                size="large"
                haptic
                fullWidth
              />
              <Text variant="micro" tone="faint" style={{ textAlign: 'center' }}>
                Changeable any time from your profile.
              </Text>
            </Column>
          ) : (
            <Text variant="micro" tone="faint">
              Nothing you have earned changes when you switch. Your level, XP, records and history
              are the same on every Ascension.
            </Text>
          )}
        </Column>
      </Screen>
    </>
  );
}
