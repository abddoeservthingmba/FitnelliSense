/**
 * The first-run tour (FR-ONB-04).
 *
 * WHY IT EXISTS: onboarding asked three questions and never said what the app
 * was. People signed up, landed on a six-tab bar and had to guess — which is
 * the feedback that produced this screen, and it is also why the dashboard got
 * a request for shortcut tiles. That request was a symptom: the tabs were not
 * unclear to reach, they were unlabelled in meaning.
 *
 * So this names each destination and says what it is FOR, in the same words the
 * tab uses, and it runs after the Ascension has been chosen so it appears in
 * the user's own colours rather than teaching them a palette they then lose.
 *
 * Skippable on every step. A tutorial that cannot be dismissed is a wall in
 * front of the product, and someone who wants to start training should be
 * allowed to; "Show me around" sits in Profile for anyone who skipped.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from '../src/components/Button';
import { Card, Row, Stack as Column } from '../src/components/Card';
import { Reveal } from '../src/components/Reveal';
import { Screen } from '../src/components/Screen';
import { Overline, Text } from '../src/components/Text';
import { AscensionSigil } from '../src/features/ascension/AscensionSigil';
import { rememberTourSeen } from '../src/auth/device-preferences';
import { useTheme } from '../src/theme';

interface Stop {
  readonly glyph: string;
  readonly tab: string;
  readonly heading: string;
  readonly body: string;
  /** The one thing to try first. Concrete, not a feature list. */
  readonly first: string;
}

/**
 * The tour, in the bar's own order, so the sequence matches what they will see
 * along the bottom of the screen a minute from now.
 */
const STOPS: readonly Stop[] = [
  {
    glyph: '◆',
    tab: 'Home',
    heading: 'Where you land',
    body: 'Your tier, this week at a glance, and your latest records. It is a summary — nothing is logged from here.',
    first: 'Glance at it after a session and watch the week fill up.',
  },
  {
    glyph: '⬟',
    tab: 'Arc',
    heading: 'Your character',
    body: 'Level, tier, daily quests and badges. Every set you log earns XP, and the tiers are named after the Ascension you picked.',
    first: 'Check today’s quests — they are usually things you were going to do anyway.',
  },
  {
    glyph: '☰',
    tab: 'Train',
    heading: 'Where you start a session',
    body: 'Your routines across the top, the full exercise catalogue underneath. Starting a routine is two taps.',
    first: 'Build one routine. Every workout afterwards starts from it.',
  },
  {
    glyph: '◓',
    tab: 'Food',
    heading: 'Eating, if you want it',
    body: 'Log meals by search or barcode. Entirely optional — the training side does not need it and will not nag you.',
    first: 'Scan one thing from your kitchen to see how it works.',
  },
  {
    glyph: '◷',
    tab: 'History',
    heading: 'Everything you have done',
    body: 'Every session, searchable, with the numbers you hit. Tap any workout to see the sets.',
    first: 'Come back here in a fortnight. It is more motivating than it sounds.',
  },
  {
    glyph: '◍',
    tab: 'Profile',
    heading: 'Settings, and your Ascension',
    body: 'Change your Ascension, units, rest timer and targets. Export or delete everything you have logged, whenever you like.',
    first: 'Set your units if you train in pounds.',
  },
];

export default function TourScreen() {
  const theme = useTheme();
  const [index, setIndex] = useState(0);

  const stop = STOPS[index] as Stop;
  const isLast = index === STOPS.length - 1;

  const finish = () => {
    // Remembered before navigating, so a slow write cannot show it twice.
    void rememberTourSeen();
    router.replace('/(tabs)');
  };

  return (
    <>
      {/* No back gesture: the tour is linear and there is nothing behind it. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <Screen scroll footerSpace={170}>
        <Column gap="xl" style={{ paddingTop: theme.space.xxl }}>
          <Row justify="space-between">
            <Overline>
              {index + 1} of {STOPS.length}
            </Overline>
            <Text variant="caption" tone="faint">
              {theme.ascension.name}
            </Text>
          </Row>

          {/* Keyed on the index so each stop animates in as its own card
              rather than the text swapping underneath a static frame. */}
          <Reveal key={index}>
            <Column gap="lg">
              <Row gap="md" style={{ alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: theme.fontSize.display,
                    color: theme.colors.accent,
                    textShadowColor: theme.colors.accent,
                    textShadowRadius: 16,
                    textShadowOffset: { width: 0, height: 0 },
                  }}
                >
                  {stop.glyph}
                </Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Overline>{stop.tab}</Overline>
                  <Text variant="heading">{stop.heading}</Text>
                </View>
              </Row>

              <Text tone="muted">{stop.body}</Text>

              <Card>
                <Column gap="xs">
                  <Overline>try this first</Overline>
                  <Text variant="caption">{stop.first}</Text>
                </Column>
              </Card>
            </Column>
          </Reveal>

          {/* Progress as dots: six stops is few enough to show at once, and it
              tells you how much is left without a percentage. */}
          <Row gap="sm">
            {STOPS.map((each, position) => (
              <View
                key={each.tab}
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 2,
                  backgroundColor:
                    position <= index ? theme.colors.accent : theme.colors.surfaceRaised,
                }}
              />
            ))}
          </Row>

          {index === 0 ? (
            <Row gap="md" style={{ alignItems: 'center' }}>
              <AscensionSigil size={48} />
              <Text variant="caption" tone="faint" style={{ flex: 1 }}>
                Six places, one minute. You can skip this and come back to it from your profile.
              </Text>
            </Row>
          ) : null}
        </Column>
      </Screen>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: theme.space.lg,
          paddingBottom: theme.space.xxl,
          gap: theme.space.sm,
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <Button
          label={isLast ? 'Start training' : 'Next'}
          onPress={() => (isLast ? finish() : setIndex((current) => current + 1))}
          size="large"
          haptic
          fullWidth
        />
        <Button
          label={isLast ? 'Back' : 'Skip the tour'}
          variant="ghost"
          onPress={() => (isLast ? setIndex((current) => current - 1) : finish())}
          fullWidth
        />
      </View>
    </>
  );
}
