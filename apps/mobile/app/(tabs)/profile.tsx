/**
 * Profile and settings (FR-AUTH-07, FR-AUTH-09, FR-AUTH-10, FR-AI-06).
 *
 * Everything onboarding asked is editable here — §4's rule is that every
 * default is overrideable, and a question answered once in a hurry should not
 * be permanent. Changes save immediately; there is no Save button to forget.
 * Destructive actions confirm, and say what will actually happen.
 */
import { useEffect, useState } from 'react';
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
import { NAV_SOUND_DEFAULT, loadNavSound, saveNavSound } from '../../src/features/nav/nav-sound';
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

  // Device preference, so it is read here rather than arriving with the profile.
  const [navSound, setNavSound] = useState(NAV_SOUND_DEFAULT);
  useEffect(() => {
    void loadNavSound().then(setNavSound);
  }, []);

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

        {/*
          This was an AI consent toggle (FR-AI-06/07) that enabled nothing.
          Insights are now computed from the user's own logged sets by
          `packages/domain`, so there is no third party to consent to and
          nothing to switch on — which is why the switch is gone rather than
          relabelled. `aiEnabled` stays in the profile for the day a model is
          actually wired in.
        */}
        {/* FR-HP-11. Named after what it changes, and honest that it is only
            wording and colour. */}
        <Section title="Your Ascension">
          <Stack gap="sm">
            <Text variant="caption" tone="muted">
              {theme.ascension.name} — {theme.ascension.tagline}
            </Text>
            <Button
              label="Change your Ascension"
              variant="secondary"
              onPress={() => router.push('/ascension')}
              fullWidth
            />
            <Text variant="micro" tone="faint">
              Changes the names of your tiers and the app's colours. Your level, XP and records stay
              exactly as they are.
            </Text>
          </Stack>
        </Section>

        <Section title="Training insights">
          <Stack gap="sm">
            <Text variant="caption" tone="muted">
              How your volume, sets and sessions compare with the period before, muscle group by
              muscle group. Worked out from your own logs — nothing is sent anywhere.
            </Text>
            <Button
              label="See my insights"
              variant="secondary"
              onPress={() => router.push('/insights')}
              fullWidth
            />
          </Stack>
        </Section>

        {/* Per device, not per account: whether you want sound depends on
            where you are, not who you are. Off does not silence the haptic —
            the tap should still feel like it landed. */}
        <Section title="Sound">
          <Row gap="sm" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text>Navigation sound</Text>
              <Text variant="caption" tone="faint">
                Plays over your music without pausing it, and stays quiet when your phone is on
                silent.
              </Text>
            </Stack>
            <Switch
              value={navSound}
              onValueChange={(next) => {
                setNavSound(next);
                void saveNavSound(next);
              }}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
              thumbColor={navSound ? theme.colors.accent : theme.colors.textFaint}
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
            <Button
              label="Privacy policy"
              variant="ghost"
              onPress={() => {
                // The API's own page, so the URL follows the deployment rather
                // than being a second copy that goes stale.
                void import('expo-linking').then((Linking) =>
                  Linking.openURL(`${API_BASE_URL.replace(/\/api\/v1$/, '')}/privacy`),
                );
              }}
              fullWidth
            />
            <Text variant="micro" tone="faint">
              What is stored, where, and who else can see it. No analytics, no advertising, nothing
              sold.
            </Text>
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
