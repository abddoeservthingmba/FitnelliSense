/**
 * Adding food — FR-NUT-01, FR-NUT-04, FR-NUT-08.
 *
 * Search, pick, set a quantity, done. The quantity step is not skipped even
 * when a serving size is known, because "1 serving" is the single biggest
 * source of wrong entries in a food diary — but the serving is offered as a
 * one-tap default so the common case is still two taps.
 *
 * "Not found" is a first-class outcome, not an error: Open Food Facts does not
 * have everything, so the empty state leads to entering the food by hand rather
 * than to a dead end.
 */
import { useState } from 'react';

import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Food, MealSlot } from '@fi/shared';
import { kjToKcal } from '@fi/domain';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { ListRow, Rule } from '../../src/components/Section';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { localToday, useFoodSearch } from '../../src/api/hooks/use-nutrition';
import { LogFoodForm } from '../../src/features/nutrition/LogFoodForm';
import { useTheme } from '../../src/theme';

/** The slot most likely intended, from the clock. Overrideable in one tap. */
function slotForNow(now: Date = new Date()): MealSlot {
  const hour = now.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export default function AddFoodScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ date?: string; mealSlot?: MealSlot }>();
  const date = params.date ?? localToday();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const mealSlot: MealSlot = params.mealSlot ?? slotForNow();

  const search = useFoodSearch(query);

  const pick = (food: Food) => setSelected(food);

  // The quantity step is a shared component: scanning arrives at the same
  // question and must ask it the same way.
  if (selected) {
    return (
      <Screen scroll>
        <LogFoodForm
          food={selected}
          date={date}
          initialMealSlot={mealSlot}
          onLogged={() => router.back()}
          onBack={() => setSelected(null)}
        />
      </Screen>
    );
  }

  // --------------------------------------------------------- search step --

  const results = search.data?.items ?? [];
  const searched = query.trim().length >= 2;

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
          <TextField
            label="Search for a food"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            placeholder="Oats, chicken, a brand name…"
          />

          <Button
            label="Scan a barcode"
            variant="secondary"
            onPress={() => router.push({ pathname: '/food/scan', params: { date, mealSlot } })}
            fullWidth
          />

          {searched && search.isLoading ? (
            <Text variant="caption" tone="muted">
              Searching…
            </Text>
          ) : null}

          {results.length > 0 ? (
            <View>
              {results.map((food, index) => (
                <View key={food.id}>
                  {index === 0 ? null : <Rule />}
                  <ListRow
                    title={food.name}
                    subtitle={[
                      food.brand,
                      `${kjToKcal(food.per100g.energyKj)} kcal / 100 g`,
                      food.source === 'custom' ? 'yours' : 'Open Food Facts',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => pick(food)}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* Not found is a route onward, not a dead end. */}
          {searched && !search.isLoading && results.length === 0 ? (
            <Stack gap="md">
              <Text tone="muted">
                Nothing found for “{query.trim()}”. Food databases are patchy —
                adding it yourself takes a moment and it will be there next time.
              </Text>
              <Button
                label="Add this food myself"
                onPress={() =>
                  router.push({ pathname: '/food/custom', params: { date, mealSlot, name: query.trim() } })
                }
                variant="accent"
                fullWidth
              />
            </Stack>
          ) : null}

          {!searched ? (
            <Button
              label="Add a food myself"
              variant="ghost"
              onPress={() => router.push({ pathname: '/food/custom', params: { date, mealSlot } })}
              fullWidth
            />
          ) : null}
        </Stack>
      </KeyboardAvoidingView>
    </Screen>
  );
}
