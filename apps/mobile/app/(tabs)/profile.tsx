/**
 * Profile and settings (FR-AUTH-07, FR-AUTH-09, FR-AUTH-10, FR-AI-06).
 *
 * Changes save immediately — there is no Save button to forget. Destructive
 * actions confirm, and say what will actually happen.
 */
import { useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Divider, Row, Stack } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { Screen } from '../../src/components/Screen';
import { Section } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { useDeleteAccount, useMe, useUpdateProfile } from '../../src/api/hooks/use-profile';
import { useAuth } from '../../src/auth/auth-context';
import { API_BASE_URL } from '../../src/api/config';
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

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(`${title}\n\n${message}`)) {
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
      <Stack gap="xl" style={{ paddingTop: theme.space.xl }}>
        <Stack gap="xs">
          <Text variant="heading">{profile.displayName}</Text>
          <Text variant="caption" tone="muted">
            {me.data.email}
          </Text>
        </Stack>

        <Section title="Units">
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
            Weights are stored in kilograms and converted for display, so switching never
            changes what you logged.
          </Text>
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
          </Stack>
        </Section>

        <Section title="Workout defaults">
          <Row gap="sm" wrap>
            {[60, 90, 120, 180].map((seconds) => (
              <Chip
                key={seconds}
                label={`${seconds}s rest`}
                selected={profile.defaultRestSecs === seconds}
                onPress={() => updateProfile.mutate({ defaultRestSecs: seconds })}
              />
            ))}
          </Row>
        </Section>

        {/* FR-AI-06 / FR-AI-07: off until explicitly enabled, and honest about
            not existing yet. */}
        <Section title="AI insights">
          <Card>
            <Row justify="space-between">
              <View style={{ flex: 1, gap: 2, paddingRight: theme.space.md }}>
                <Text variant="callout">Training insights</Text>
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
          </Card>
        </Section>

        <Section title="Your data">
          <Card padded={false}>
            <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
              <Text variant="caption" tone="muted">
                Everything you have logged, as JSON. Yours to keep, whenever you want it.
              </Text>
              <Button
                label="Export my data"
                variant="secondary"
                onPress={() => {
                  // FR-AUTH-09 / NFR-B-10: an authenticated GET the browser or
                  // the OS can save directly.
                  const url = `${API_BASE_URL}/me/export`;
                  void import('expo-linking').then((Linking) => Linking.openURL(url));
                }}
              />
              <Divider />
              <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
              <Button
                label="Delete my account"
                variant="danger"
                onPress={() =>
                  confirm(
                    'Delete your account?',
                    'Your workouts, routines and records are removed within 30 days. This cannot be undone.',
                    () => {
                      deleteAccount.mutate(undefined, { onSuccess: () => void signOut() });
                    },
                  )
                }
              />
            </View>
          </Card>
        </Section>
      </Stack>
    </Screen>
  );
}
