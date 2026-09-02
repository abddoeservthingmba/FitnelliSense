/**
 * The quantity step: a chosen food becomes a logged entry.
 *
 * Shared by search and by scanning, because both arrive at the same question —
 * "how much of it?" — and the answer is worth asking properly. A scan that
 * logged 100 g by assumption would be fast and wrong.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { MEAL_SLOTS, type Food, type MealSlot } from '@fi/shared';
import { kjToKcal } from '@fi/domain';
import { Button } from '../../components/Button';
import { Stack } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Section } from '../../components/Section';
import { Overline, Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { useLogFood } from '../../api/hooks/use-nutrition';
import { uuidv7 } from '../../lib/uuid';
import { useTheme } from '../../theme';

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export interface LogFoodFormProps {
  food: Food;
  date: string;
  initialMealSlot: MealSlot;
  onLogged: () => void;
  /** Null hides the "pick something else" escape, e.g. after a scan. */
  onBack: (() => void) | null;
}

export function LogFoodForm({ food, date, initialMealSlot, onLogged, onBack }: LogFoodFormProps) {
  const theme = useTheme();
  const logFood = useLogFood();

  // Pre-filled with the label's serving where there is one, 100 g otherwise —
  // both are a starting point the user is expected to correct.
  const [quantity, setQuantity] = useState(
    food.servingG ? String(Math.round(Number(food.servingG))) : '100',
  );
  const [mealSlot, setMealSlot] = useState<MealSlot>(initialMealSlot);

  const grams = Number(quantity) || 0;
  const factor = grams / 100;

  const submit = () => {
    if (grams <= 0) return;
    logFood.mutate(
      { id: uuidv7(), date, mealSlot, quantityG: quantity, foodId: food.id },
      { onSuccess: onLogged },
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
        <Stack gap="xs">
          <Overline>how much</Overline>
          <Text variant="heading">{food.name}</Text>
          {food.brand ? <Text tone="muted">{food.brand}</Text> : null}

          {/*
            Where the numbers came from. It matters because Open Food Facts is
            crowd-edited: a figure someone typed into a public wiki deserves
            more scepticism than one the user read off the packet themselves,
            and the only way to apply that scepticism is to know which it is.
          */}
          <Text variant="micro" tone="faint">
            {food.source === 'custom'
              ? 'Your own entry'
              : 'Open Food Facts — crowd-sourced, so worth a glance against the packet'}
            {food.barcode ? ` · ${food.barcode}` : ''}
          </Text>
        </Stack>

        {/* The panel as recorded, so it can be checked before it is committed. */}
        <Section title="Per 100 g">
          <Text variant="caption" tone="muted">
            {kjToKcal(food.per100g.energyKj)} kcal · {Number(food.per100g.proteinG).toFixed(1)} g
            protein · {Number(food.per100g.carbsG).toFixed(1)} g carbs ·{' '}
            {Number(food.per100g.fatG).toFixed(1)} g fat
          </Text>
        </Section>

        <TextField
          label="Grams"
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          autoFocus
          hint={
            food.servingLabel
              ? `The label calls one serving ${food.servingLabel}.`
              : 'Weighed rather than guessed, wherever you can.'
          }
        />

        {food.servingG ? (
          <Button
            label={`One serving (${Math.round(Number(food.servingG))} g)`}
            variant="secondary"
            onPress={() => setQuantity(String(Math.round(Number(food.servingG))))}
            fullWidth
          />
        ) : null}

        <Section title="Meal">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {MEAL_SLOTS.map((slot) => (
              <Chip
                key={slot}
                label={MEAL_LABELS[slot]}
                selected={mealSlot === slot}
                onPress={() => setMealSlot(slot)}
              />
            ))}
          </View>
        </Section>

        {/* What this will add, before it is added. */}
        <Section title="This adds">
          <Stack gap="xs">
            <Text variant="metric" tone="accent">
              {kjToKcal(Math.round(food.per100g.energyKj * factor))} kcal
            </Text>
            <Text variant="caption" tone="muted">
              {(Number(food.per100g.proteinG) * factor).toFixed(1)} g protein ·{' '}
              {(Number(food.per100g.carbsG) * factor).toFixed(1)} g carbs ·{' '}
              {(Number(food.per100g.fatG) * factor).toFixed(1)} g fat
            </Text>
          </Stack>
        </Section>

        <Stack gap="sm">
          <Button
            label="Log it"
            onPress={submit}
            disabled={grams <= 0 || logFood.isPending}
            loading={logFood.isPending}
            variant="accent"
            size="large"
            fullWidth
            haptic
          />
          {onBack ? (
            <Button label="Pick something else" variant="ghost" onPress={onBack} fullWidth />
          ) : null}
        </Stack>
      </Stack>
    </KeyboardAvoidingView>
  );
}
