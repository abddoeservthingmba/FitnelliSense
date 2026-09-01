/**
 * Onboarding (J1 step 2).
 *
 * Three questions, one per screen, every one skippable — J1 is explicit that
 * only units are mandatory, and §4's design tension resolves toward "no
 * mandatory wizards". The answers shape defaults, not permissions: nothing
 * here is required to log a workout, and all of it is editable later in
 * Profile.
 *
 * A skipped question stays null rather than being silently defaulted, so the
 * app never claims to know something the user did not tell it.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  REST_SECONDS_OPTIONS,
  SESSION_MINUTES_OPTIONS,
  TRAINING_DAYS_OPTIONS,
  type ExperienceLevel,
  type UpdateProfileRequest,
} from '@fi/shared';
import { useUpdateProfile } from '../src/api/hooks/use-profile';
import { Button } from '../src/components/Button';
import { Row, Stack } from '../src/components/Card';
import { Choice, ChoicePill } from '../src/components/Chip';
import { ActionBar, Screen } from '../src/components/Screen';
import { Meter } from '../src/components/Section';
import { Overline, Text } from '../src/components/Text';
import { formatClock } from '../src/lib/format';
import { useTheme } from '../src/theme';

const EXPERIENCE_CHOICES: { value: ExperienceLevel; label: string; detail: string }[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    detail: 'New to lifting, or back after a long break. Under a year of consistent training.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    detail: 'You know the main lifts and follow a plan. Progress comes week to week, not session to session.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    detail: 'Years of training, periodised. You track RPE and know what a hard set feels like.',
  },
];

type StepId = 'experience' | 'time' | 'rest';
const STEPS: StepId[] = ['experience', 'time', 'rest'];

export default function OnboardingScreen() {
  const theme = useTheme();
  const updateProfile = useUpdateProfile();

  const [stepIndex, setStepIndex] = useState(0);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [restSecs, setRestSecs] = useState<number>(120);

  const step = STEPS[stepIndex] ?? 'experience';
  const isLast = stepIndex === STEPS.length - 1;

  const finish = (answers: UpdateProfileRequest) => {
    // Saved in one request at the end: a half-finished onboarding leaves no
    // half-written profile behind. `markOnboarded` goes with it either way, so
    // skipping is remembered as a decision rather than asked again next launch.
    updateProfile.mutate(
      { ...answers, markOnboarded: true },
      { onSettled: () => router.replace('/(tabs)') },
    );
  };

  const advance = () => {
    if (!isLast) {
      setStepIndex((current) => current + 1);
      return;
    }
    finish({
      ...(experience === null ? {} : { experience }),
      ...(days === null ? {} : { trainingDaysPerWeek: days }),
      ...(minutes === null ? {} : { sessionMinutes: minutes }),
      defaultRestSecs: restSecs,
    });
  };

  /** Skipping still records that we asked, and keeps whatever was answered. */
  const skipAll = () =>
    finish({
      ...(experience === null ? {} : { experience }),
      ...(days === null ? {} : { trainingDaysPerWeek: days }),
      ...(minutes === null ? {} : { sessionMinutes: minutes }),
    });

  const canAdvance =
    step === 'experience' ? experience !== null : step === 'time' ? days !== null : true;

  return (
    <>
      <Screen scroll footerSpace={150}>
        <Stack gap="xl" style={{ paddingTop: theme.space.xl }}>
          <Stack gap="sm">
            <Row justify="space-between">
              <Overline>
                Step {stepIndex + 1} of {STEPS.length}
              </Overline>
              <Text
                variant="micro"
                tone="faint"
                overline
                weight="heavy"
                onPress={skipAll}
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
              >
                Skip
              </Text>
            </Row>
            <Meter progress={(stepIndex + 1) / STEPS.length} />
          </Stack>

          {step === 'experience' ? (
            <Stack gap="xl">
              <Stack gap="sm">
                <Text variant="heading">How much lifting have you done?</Text>
                <Text tone="muted">
                  This sets your starting defaults. It changes nothing you can’t override.
                </Text>
              </Stack>
              <Stack gap="md">
                {EXPERIENCE_CHOICES.map((choice) => (
                  <Choice
                    key={choice.value}
                    label={choice.label}
                    detail={choice.detail}
                    selected={experience === choice.value}
                    onPress={() => setExperience(choice.value)}
                  />
                ))}
              </Stack>
            </Stack>
          ) : null}

          {step === 'time' ? (
            <Stack gap="xl">
              <Stack gap="sm">
                <Text variant="heading">How much time do you have?</Text>
                <Text tone="muted">
                  Be honest rather than optimistic — the plan that fits your week is the one
                  you’ll actually finish.
                </Text>
              </Stack>

              <Stack gap="md">
                <Overline>Days each week</Overline>
                <Row gap="sm">
                  {TRAINING_DAYS_OPTIONS.map((option) => (
                    <ChoicePill
                      key={option}
                      value={String(option)}
                      unit="days"
                      selected={days === option}
                      onPress={() => setDays(option)}
                      accessibilityLabel={`${option} days a week`}
                    />
                  ))}
                </Row>
              </Stack>

              <Stack gap="md">
                <Overline>Time per session</Overline>
                <Row gap="sm">
                  {SESSION_MINUTES_OPTIONS.map((option) => (
                    <ChoicePill
                      key={option}
                      value={String(option)}
                      unit="min"
                      selected={minutes === option}
                      onPress={() => setMinutes(option)}
                      accessibilityLabel={`${option} minutes per session`}
                    />
                  ))}
                </Row>
              </Stack>

              {days !== null && minutes !== null ? (
                <Text variant="caption" tone="faint">
                  That’s {((days * minutes) / 60).toFixed(1)} hours a week.
                </Text>
              ) : null}
            </Stack>
          ) : null}

          {step === 'rest' ? (
            <Stack gap="xl">
              <Stack gap="sm">
                <Text variant="heading">How long between sets?</Text>
                <Text tone="muted">
                  Two minutes suits most compound lifts. The timer starts on its own each time
                  you finish a set, and you can change it per exercise.
                </Text>
              </Stack>

              <View style={{ alignItems: 'center', paddingVertical: theme.space.lg }}>
                <Text variant="hero" tone="accent">
                  {formatClock(restSecs)}
                </Text>
                <Overline>default rest</Overline>
              </View>

              <Row gap="sm">
                {REST_SECONDS_OPTIONS.map((option) => (
                  <ChoicePill
                    key={option}
                    value={option >= 60 ? `${option / 60}` : `${option}`}
                    unit={option >= 60 ? 'min' : 'sec'}
                    selected={restSecs === option}
                    onPress={() => setRestSecs(option)}
                    accessibilityLabel={`${option} seconds of rest`}
                  />
                ))}
              </Row>
            </Stack>
          ) : null}
        </Stack>
      </Screen>

      <ActionBar>
        <Button
          label={isLast ? 'Start training' : 'Continue'}
          onPress={advance}
          disabled={!canAdvance}
          loading={updateProfile.isPending}
          size="large"
          fullWidth
          haptic
        />
        {stepIndex > 0 ? (
          <Button
            label="Back"
            variant="ghost"
            onPress={() => setStepIndex((current) => current - 1)}
            fullWidth
          />
        ) : (
          <Button label="I’ll do this later" variant="ghost" onPress={skipAll} fullWidth />
        )}
      </ActionBar>
    </>
  );
}
