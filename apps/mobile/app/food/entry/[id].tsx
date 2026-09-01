/**
 * Editing a logged entry — FR-NUT-12.
 *
 * Only the quantity and the meal, because those are the two things people get
 * wrong. The nutrition panel is deliberately not editable here: it is the
 * snapshot the entry was logged with (FR-NUT-03), and letting it be edited
 * would make it a guess rather than a record.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MEAL_SLOTS, type MealSlot } from '@fi/shared';
import { kjToKcal } from '@fi/domain';
import { Button } from '../../../src/components/Button';
import { Stack } from '../../../src/components/Card';
import { Chip } from '../../../src/components/Chip';
import { Screen } from '../../../src/components/Screen';
import { Section } from '../../../src/components/Section';
import { Overline, Text } from '../../../src/components/Text';
import { TextField } from '../../../src/components/TextField';
import { ErrorState, LoadingState } from '../../../src/components/StateViews';
import {
  localToday,
  useDeleteFoodEntry,
  useNutritionDay,
  useUpdateFoodEntry,
} from '../../../src/api/hooks/use-nutrition';
import { useTheme } from '../../../src/theme';

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function EditEntryScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const date = params.date ?? localToday();

  // Read from the day already in the cache rather than adding a
  // fetch-one-entry endpoint for a screen reached only from that day.
  const day = useNutritionDay(date);
  const update = useUpdateFoodEntry();
  const remove = useDeleteFoodEntry(date);

  const entry = day.data?.entries.find((item) => item.id === params.id);

  const [quantity, setQuantity] = useState<string | null>(null);
  const [mealSlot, setMealSlot] = useState<MealSlot | null>(null);

  if (day.isLoading) return <LoadingState />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />;
  if (!entry) {
    return (
      <Screen>
        <Stack gap="lg" style={{ paddingTop: theme.space.xxl }}>
          <Text variant="heading">That entry is gone</Text>
          <Text tone="muted">It may already have been removed.</Text>
          <Button label="Back to the day" onPress={() => router.back()} fullWidth />
        </Stack>
      </Screen>
    );
  }

  const grams = Number(quantity ?? entry.quantityG) || 0;
  const slot = mealSlot ?? entry.mealSlot;
  const factor = grams / 100;
  const changed = grams !== Number(entry.quantityG) || slot !== entry.mealSlot;

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
          <Stack gap="xs">
            <Overline>edit</Overline>
            <Text variant="heading">{entry.foodName}</Text>
            {entry.brand ? <Text tone="muted">{entry.brand}</Text> : null}
          </Stack>

          <TextField
            label="Grams"
            value={quantity ?? String(Math.round(Number(entry.quantityG)))}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
          />

          <Section title="Meal">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
              {MEAL_SLOTS.map((option) => (
                <Chip
                  key={option}
                  label={MEAL_LABELS[option]}
                  selected={slot === option}
                  onPress={() => setMealSlot(option)}
                />
              ))}
            </View>
          </Section>

          <Section title="This entry">
            <Stack gap="xs">
              <Text variant="metric" tone="accent">
                {kjToKcal(Math.round(entry.per100g.energyKj * factor))} kcal
              </Text>
              <Text variant="caption" tone="muted">
                {(Number(entry.per100g.proteinG) * factor).toFixed(1)} g protein ·{' '}
                {(Number(entry.per100g.carbsG) * factor).toFixed(1)} g carbs ·{' '}
                {(Number(entry.per100g.fatG) * factor).toFixed(1)} g fat
              </Text>
              <Text variant="micro" tone="faint">
                Logged with {entry.per100g.energyKj} kJ per 100 g. That figure stays
                as it was recorded.
              </Text>
            </Stack>
          </Section>

          <Stack gap="sm">
            <Button
              label="Save"
              onPress={() =>
                update.mutate(
                  {
                    id: entry.id,
                    patch: { quantityG: String(grams), mealSlot: slot },
                  },
                  { onSuccess: () => router.back() },
                )
              }
              disabled={!changed || grams <= 0 || update.isPending}
              loading={update.isPending}
              variant="accent"
              size="large"
              fullWidth
              haptic
            />
            <Button
              label="Remove this entry"
              variant="ghost"
              onPress={() => remove.mutate(entry.id, { onSuccess: () => router.back() })}
              loading={remove.isPending}
              fullWidth
            />
          </Stack>
        </Stack>
      </KeyboardAvoidingView>
    </Screen>
  );
}
