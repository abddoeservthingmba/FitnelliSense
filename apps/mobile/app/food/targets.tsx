/**
 * Nutrition targets — FR-NUT-10, FR-NUT-11.
 *
 * Every field is optional and every blank field stays derived from the profile,
 * so someone can pin protein and let the rest follow their bodyweight.
 *
 * There is no goal picker here — no "lose weight", no deficit, no timeline.
 * That is the deliberate line in the scope extension: this is a food diary with
 * arithmetic, not a diet, and a target is a number to aim at rather than advice.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { kcalToKj, kjToKcal } from '@fi/domain';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import {
  useNutritionTargets,
  useUpdateNutritionTargets,
} from '../../src/api/hooks/use-nutrition';
import { useTheme } from '../../src/theme';

/** '' means "leave this derived", which is different from 0. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function TargetsScreen() {
  const theme = useTheme();
  const targets = useNutritionTargets();
  const update = useUpdateNutritionTargets();

  const [kcal, setKcal] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [carbs, setCarbs] = useState<string | null>(null);
  const [fat, setFat] = useState<string | null>(null);

  if (targets.isLoading) return <LoadingState />;
  if (targets.isError || !targets.data) {
    return <ErrorState error={targets.error} onRetry={() => void targets.refetch()} />;
  }

  const current = targets.data;
  const custom = current.origin === 'custom';

  // Pre-filled only when the user already owns the numbers. Pre-filling an
  // estimate would silently convert it into an override on the first save.
  const initial = (value: string) => (custom ? value : '');

  const submit = () => {
    const energyKcal = toNumberOrNull(kcal ?? initial(String(kjToKcal(current.energyKj))));
    update.mutate(
      {
        energyKj: energyKcal === null ? null : kcalToKj(energyKcal),
        proteinG: toNumberOrNull(protein ?? initial(current.proteinG))?.toFixed(2) ?? null,
        carbsG: toNumberOrNull(carbs ?? initial(current.carbsG))?.toFixed(2) ?? null,
        fatG: toNumberOrNull(fat ?? initial(current.fatG))?.toFixed(2) ?? null,
      },
      { onSuccess: () => router.back() },
    );
  };

  const clear = () => {
    update.mutate(
      { energyKj: null, proteinG: null, carbsG: null, fatG: null },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
          <Stack gap="sm">
            <Overline>daily targets</Overline>
            <Text variant="heading">Your own numbers</Text>
            <Text tone="muted">
              Leave anything blank to keep it worked out from your profile. These
              are numbers to aim at, not advice — nothing in the app scores you
              against them.
            </Text>
          </Stack>

          <TextField
            label="Energy (kcal)"
            value={kcal ?? initial(String(kjToKcal(current.energyKj)))}
            onChangeText={setKcal}
            keyboardType="decimal-pad"
            placeholder={String(kjToKcal(current.energyKj) || '')}
          />
          <TextField
            label="Protein (g)"
            value={protein ?? initial(current.proteinG)}
            onChangeText={setProtein}
            keyboardType="decimal-pad"
            placeholder={String(Math.round(Number(current.proteinG)) || '')}
          />
          <TextField
            label="Carbohydrate (g)"
            value={carbs ?? initial(current.carbsG)}
            onChangeText={setCarbs}
            keyboardType="decimal-pad"
            placeholder={String(Math.round(Number(current.carbsG)) || '')}
          />
          <TextField
            label="Fat (g)"
            value={fat ?? initial(current.fatG)}
            onChangeText={setFat}
            keyboardType="decimal-pad"
            placeholder={String(Math.round(Number(current.fatG)) || '')}
          />

          <Text variant="caption" tone="faint">
            {current.basis}
          </Text>

          <Stack gap="sm">
            <Button
              label="Save"
              onPress={submit}
              loading={update.isPending}
              variant="accent"
              size="large"
              fullWidth
              haptic
            />
            {custom ? (
              <Button
                label="Go back to the estimate"
                variant="ghost"
                onPress={clear}
                fullWidth
              />
            ) : null}
          </Stack>
        </Stack>
      </KeyboardAvoidingView>
    </Screen>
  );
}
