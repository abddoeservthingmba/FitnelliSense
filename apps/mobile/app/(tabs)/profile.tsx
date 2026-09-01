/**
 * Profile and settings (FR-AUTH-07, FR-AUTH-09, FR-AUTH-10, FR-AI-06).
 *
 * Everything onboarding asked is editable here — §4's rule is that every
 * default is overrideable, and a question answered once in a hurry should not
 * be permanent. Changes save immediately; there is no Save button to forget.
 * Destructive actions confirm, and say what will actually happen.
 */
import { useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { REST_SECONDS_OPTIONS, SESSION_MINUTES_OPTIONS, TRAINING_DAYS_OPTIONS } from '@fi/shared';
import { Button } from '../../src/components/Button';
import { Row, Stack } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { Screen } from '../../src/components/Screen';
import { Rule, Section, Stat, StatRow } from '../../src/components/Section';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { TierStrip } from '../../src/features/hunter/TierStrip';
import { useNutritionTargets } from '../../src/api/hooks/use-nutrition';
import { useDeleteAccount, useMe, useUpdateProfile } from '../../src/api/hooks/use-profile';
import { useAuth } from '../../src/auth/auth-context';
import { API_BASE_URL } from '../../src/api/config';
import { kjToKcal } from '@fi/domain';
import { formatClock } from '../../src/lib/format';
import { useUnits } from '../../src/lib/use-units';
import { useTheme } from '../../src/theme';

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const;

export default function ProfileScreen() {
  const theme = useTheme();
  const units = useUnits();
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const targets = useNutritionTargets();
  const { signOut } = useAuth();

  // Local drafts for the free-text fields, so typing is never round-tripped.
  const [bodyweight, setBodyweight] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  if (me.isLoading) return <LoadingState />;
  if (me.isError || !me.data) {
    return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  }

  const profile = me.data.profile;
  const bodyweightValue = bodyweight ?? units.toInput(profile.bodyweightKg);
  const weeklyHours =
    profile.trainingDaysPerWeek !== null && profile.sessionMinutes !== null
      ? ((profile.trainingDaysPerWeek * profile.sessionMinutes) / 60).toFixed(1)
      : null;

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (
        typeof globalThis.confirm === 'function' &&
        globalThis.confirm(`${title}\n\n${message}`)
      ) {
        onConfirm();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: onConfirm },
    ]);
  };

  return (
    <Screen scroll>
      <Stack gap="xxl" style={{ paddingTop: theme.space.xl }}>
        <Stack gap="md">
          <Stack gap="xs">
            <Overline>{me.data.email}</Overline>
            <Text variant="heading">{profile.displayName}</Text>
          </Stack>
          <TierStrip />
        </Stack>

        {/* Onboarding's answers, read back as the plan they describe. */}
        <StatRow>
          <View style={{ flex: 1 }}>
            <Stat
              size="small"
              value={profile.trainingDaysPerWeek === null ? '—' : `${profile.trainingDaysPerWeek}`}
              label="days a week"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Stat
              size="small"
              value={profile.sessionMinutes === null ? '—' : `${profile.sessionMinutes}m`}
              label="per session"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Stat
              size="small"
              value={weeklyHours === null ? '—' : `${weeklyHours}h`}
              label="a week"
            />
          </View>
        </StatRow>

        {/* The banner on Home can be dismissed, so verification needs a
            permanent home. Shown either way, because "verified" is worth
            being able to confirm. */}
        <Section title="Email">
          <Stack gap="sm">
            <Row gap="sm" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Stack gap="xs" style={{ flex: 1 }}>
                <Text>{me.data.email}</Text>
                <Text variant="caption" tone={me.data.emailVerified ? 'accent' : 'muted'}>
                  {me.data.emailVerified
                    ? 'Verified'
                    : 'Not verified — everything still works, but we cannot help you recover your password.'}
                </Text>
              </Stack>
            </Row>
            {me.data.emailVerified ? null : (
              <Button
                label="Verify this address"
                variant="secondary"
                onPress={() => router.push('/verify-email')}
                fullWidth
              />
            )}
          </Stack>
        </Section>

        {/* FR-NUT-10. Read-only here with a route to change them: the estimate
            is derived from fields on this same screen, so it updates itself. */}
        <Section title="Daily nutrition targets">
          <Stack gap="sm">
            {targets.data ? (
              <>
                <Text>
                  {kjToKcal(targets.data.energyKj) === 0
                    ? 'No target yet'
                    : `${kjToKcal(targets.data.energyKj)} kcal · ${Math.round(
                        Number(targets.data.proteinG),
                      )} g protein`}
                </Text>
                <Text variant="caption" tone="faint">
                  {targets.data.basis}
                </Text>
              </>
            ) : (
              <Text variant="caption" tone="faint">
                Loading…
              </Text>
            )}
            <Button
              label="Set your own targets"
              variant="secondary"
              onPress={() => router.push('/food/targets')}
              fullWidth
            />
          </Stack>
        </Section>

        <Section title="Units">
          <Stack gap="sm">
            <Row gap="sm">
              <Chip
                label="Kilograms"
                selected={profile.units === 'metric'}
                onPress={() => updateProfile.mutate({ units: 'metric' })}
              />
              <Chip
                label="Pounds"
                selected={profile.units === 'imperial'}
                onPress={() => updateProfile.mutate({ units: 'imperial' })}
              />
            </Row>
            <Text variant="caption" tone="faint">
              Weights are stored in kilograms and converted for display, so switching never changes
              what you logged.
            </Text>
          </Stack>
        </Section>

        <Section title="Experience">
          <Row gap="sm" wrap>
            {EXPERIENCE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={profile.experience === option.value}
                onPress={() => updateProfile.mutate({ experience: option.value })}
              />
            ))}
          </Row>
        </Section>

        <Section title="Your week">
          <Stack gap="lg">
            <Stack gap="sm">
              <Overline>Days each week</Overline>
              <Row gap="sm" wrap>
                {TRAINING_DAYS_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={`${option} days`}
                    selected={profile.trainingDaysPerWeek === option}
                    onPress={() => updateProfile.mutate({ trainingDaysPerWeek: option })}
                  />
                ))}
              </Row>
            </Stack>

            <Stack gap="sm">
              <Overline>Time per session</Overline>
              <Row gap="sm" wrap>
                {SESSION_MINUTES_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={`${option} min`}
                    selected={profile.sessionMinutes === option}
                    onPress={() => updateProfile.mutate({ sessionMinutes: option })}
                  />
                ))}
              </Row>
            </Stack>

            <Stack gap="sm">
              <Overline>Default rest between sets</Overline>
              <Row gap="sm" wrap>
                {REST_SECONDS_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={formatClock(option)}
                    selected={profile.defaultRestSecs === option}
                    onPress={() => updateProfile.mutate({ defaultRestSecs: option })}
                  />
                ))}
              </Row>
            </Stack>
          </Stack>
        </Section>

        <Section title="About you">
          <Stack gap="md">
            {/* Text fields save on blur, not per keystroke — one request per
                edit, and the field never fights the response. */}
            <TextField
              label="Display name"
              value={name ?? profile.displayName}
              onChangeText={setName}
              onBlur={() => {
                const next = (name ?? '').trim();
                if (next && next !== profile.displayName) {
                  updateProfile.mutate({ displayName: next });
                }
              }}
            />
            <TextField
              label={`Bodyweight (${units.label})`}
              value={bodyweightValue}
              onChangeText={setBodyweight}
              onBlur={() =>
                updateProfile.mutate({ bodyweightKg: units.fromInput(bodyweightValue) })
              }
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="Optional"
            />
          </Stack>
        </Section>

        {/* FR-AI-06 / FR-AI-07: off until explicitly enabled, and honest about
            not existing yet. */}
        <Section title="AI insights">
          <Row justify="space-between">
            <View style={{ flex: 1, gap: 3, paddingRight: theme.space.md }}>
              <Text variant="callout" weight="semibold">
                Training insights
              </Text>
              <Text variant="caption" tone="muted">
                Advisory only, and never applied automatically. Arriving in a later release —
                enabling this now only records your consent.
              </Text>
            </View>
            <Switch
              value={profile.aiEnabled}
              onValueChange={(value) => updateProfile.mutate({ aiEnabled: value })}
              accessibilityLabel="Enable AI insights"
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            />
          </Row>
        </Section>

        <Section title="Your data">
          <Stack gap="md">
            <Text variant="caption" tone="muted">
              Everything you have logged, as JSON. Yours to keep, whenever you want it.
            </Text>
            <Button
              label="Export my data"
              variant="secondary"
              onPress={() => {
                // FR-AUTH-09 / NFR-B-10: an authenticated GET the browser or
                // the OS can save directly.
                void import('expo-linking').then((Linking) =>
                  Linking.openURL(`${API_BASE_URL}/me/export`),
                );
              }}
              fullWidth
            />
            <Rule />
            <Button label="Sign out" variant="ghost" onPress={() => void signOut()} fullWidth />
            <Button
              label="Delete my account"
              variant="danger"
              onPress={() =>
                confirm(
                  'Delete your account?',
                  'Your workouts, routines and records are removed within 30 days. This cannot be undone.',
                  () => deleteAccount.mutate(undefined, { onSuccess: () => void signOut() }),
                )
              }
              fullWidth
            />
          </Stack>
        </Section>
      </Stack>
    </Screen>
  );
}
