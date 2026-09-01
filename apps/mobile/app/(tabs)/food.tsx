/**
 * The food diary — FR-NUT-01, FR-NUT-09, FR-NUT-12.
 *
 * One day at a time, because that is the unit a food diary is kept in. The
 * totals lead, then each meal in the order it is eaten.
 *
 * There is deliberately no score, no streak and no praise or warning about
 * being under or over a target (FR-NUT-11). The screen states what was eaten
 * and what the target is, and stops there.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MEAL_SLOTS, type FoodEntry, type MealSlot } from '@fi/shared';
import { kjToKcal } from '@fi/domain';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { ListRow, Rule, Section } from '../../src/components/Section';
import { Overline, Text } from '../../src/components/Text';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { MacroSummary } from '../../src/features/nutrition/MacroSummary';
import {
  localToday,
  useDeleteFoodEntry,
  useNutritionDay,
} from '../../src/api/hooks/use-nutrition';
import { useTheme } from '../../src/theme';

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** Shifts a yyyy-mm-dd date by whole days without touching a timezone. */
function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function humanDate(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === shiftDate(today, -1)) return 'Yesterday';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function FoodScreen() {
  const theme = useTheme();
  const today = localToday();
  const [date, setDate] = useState(today);

  const day = useNutritionDay(date);
  const deleteEntry = useDeleteFoodEntry(date);

  if (day.isLoading) return <LoadingState label="Loading your day" />;
  if (day.isError || !day.data) {
    return <ErrorState error={day.error} onRetry={() => void day.refetch()} />;
  }

  const data = day.data;
  const entriesFor = (slot: MealSlot): FoodEntry[] =>
    data.entries.filter((entry) => entry.mealSlot === slot);

  return (
    <Screen scroll footerSpace={80}>
      <Stack gap="xxl" style={{ paddingTop: theme.space.xl }}>
        <Stack gap="sm">
          <Overline>food</Overline>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Button
              label="‹"
              variant="ghost"
              onPress={() => setDate(shiftDate(date, -1))}
              accessibilityLabel="Previous day"
            />
            <Text variant="heading">{humanDate(date, today)}</Text>
            <Button
              label="›"
              variant="ghost"
              onPress={() => setDate(shiftDate(date, 1))}
              // Tomorrow has nothing in it and nothing can be logged forward.
              disabled={date >= today}
              accessibilityLabel="Next day"
            />
          </View>
        </Stack>

        <MacroSummary totals={data.totals} targets={data.targets} />

        <Button
          label="Add food"
          onPress={() => router.push({ pathname: '/food/add', params: { date } })}
          variant="accent"
          size="large"
          fullWidth
          haptic
        />

        {MEAL_SLOTS.map((slot) => {
          const entries = entriesFor(slot);
          const meal = data.byMeal.find((item) => item.mealSlot === slot);

          return (
            <Section
              key={slot}
              title={MEAL_LABELS[slot]}
              action={{
                label: 'Add',
                onPress: () =>
                  router.push({ pathname: '/food/add', params: { date, mealSlot: slot } }),
              }}
            >
              {entries.length === 0 ? (
                <Text variant="caption" tone="faint">
                  Nothing logged.
                </Text>
              ) : (
                <View>
                  {/* The meal's own subtotal, so a meal can be read on its own. */}
                  <Text variant="caption" tone="muted">
                    {kjToKcal(meal?.energyKj ?? 0)} kcal · {Math.round(Number(meal?.proteinG ?? 0))}
                    {' g protein'}
                  </Text>
                  {entries.map((entry, index) => (
                    <View key={entry.id}>
                      {index === 0 ? null : <Rule />}
                      <ListRow
                        title={entry.foodName}
                        subtitle={`${Math.round(Number(entry.quantityG))} g${
                          entry.brand ? ` · ${entry.brand}` : ''
                        }`}
                        trailing={
                          <Text variant="label" weight="bold">
                            {kjToKcal(entry.totals.energyKj)}
                          </Text>
                        }
                        onPress={() =>
                          router.push({ pathname: '/food/entry/[id]', params: { id: entry.id, date } })
                        }
                        onLongPress={() => deleteEntry.mutate(entry.id)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Section>
          );
        })}

        <Text variant="micro" tone="faint">
          Long-press an entry to remove it. This is a diary, not a diet — nothing
          here is scored.
        </Text>
      </Stack>
    </Screen>
  );
}
