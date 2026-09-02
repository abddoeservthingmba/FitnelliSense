/**
 * Adding a food by hand — FR-NUT-08.
 *
 * The escape hatch that makes the rest of nutrition usable: food databases are
 * patchy, and a diary you cannot record your own cooking in is not a diary.
 *
 * The panel is asked for per 100 g because that is what the packet says. Asking
 * "per serving" would mean the user doing the division, badly.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { kcalToKj, panelIsPlausible, dec, ZERO } from '@fi/domain';
import type { Food, MealSlot } from '@fi/shared';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { LogFoodForm } from '../../src/features/nutrition/LogFoodForm';
import { localToday, useCreateCustomFood } from '../../src/api/hooks/use-nutrition';
import { uuidv7 } from '../../src/lib/uuid';
import { useTheme } from '../../src/theme';

export default function CustomFoodScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    date?: string;
    mealSlot?: MealSlot;
    name?: string;
    /** Carried from a scan that found nothing, so the number is not lost. */
    barcode?: string;
  }>();
  const date = params.date ?? localToday();

  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  // kcal, because that is what a UK/US label leads with and what people know.
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const [created, setCreated] = useState<Food | null>(null);
  const createFood = useCreateCustomFood();

  // Once created, hand straight over to the same quantity step as everything
  // else — the user came here to log something, not to fill in a database.
  if (created) {
    return (
      <Screen scroll>
        <LogFoodForm
          food={created}
          date={date}
          initialMealSlot={params.mealSlot ?? 'snack'}
          onLogged={() => router.dismissTo('/(tabs)/food')}
          onBack={null}
        />
      </Screen>
    );
  }

  const energyKj = kcal.trim() === '' ? 0 : kcalToKj(Number(kcal));
  const panel = {
    energyKj,
    proteinG: (Number(protein) || 0).toFixed(2),
    carbsG: (Number(carbs) || 0).toFixed(2),
    fatG: (Number(fat) || 0).toFixed(2),
  };

  const complete = name.trim().length > 0 && kcal.trim() !== '';

  // R15: a panel whose macros are wildly apart from its energy is usually a
  // typo. Warned about, never blocked — the label is the user's to read.
  const plausible =
    !complete ||
    panelIsPlausible({
      energyKj,
      proteinG: protein.trim() === '' ? ZERO : dec(panel.proteinG),
      carbsG: carbs.trim() === '' ? ZERO : dec(panel.carbsG),
      fatG: fat.trim() === '' ? ZERO : dec(panel.fatG),
    });

  const submit = () => {
    if (!complete) return;
    createFood.mutate(
      {
        id: uuidv7(),
        name: name.trim(),
        brand: brand.trim() === '' ? null : brand.trim(),
        per100g: panel,
        servingG: null,
        servingLabel: null,
      },
      { onSuccess: setCreated },
    );
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="xl" style={{ paddingTop: theme.space.lg }}>
          <Stack gap="xs">
            <Overline>your own food</Overline>
            <Text variant="heading">What is it?</Text>
            <Text tone="muted">
              Copy the figures from the packet, per 100 g. Only you will see this food.
            </Text>
          </Stack>

          {params.barcode ? (
            <Text variant="caption" tone="muted">
              Barcode {params.barcode} — scanned, but not in the food database. What you enter here
              is yours; it is not published back to anyone.
            </Text>
          ) : null}

          <TextField label="Name" value={name} onChangeText={setName} autoFocus />
          <TextField label="Brand (optional)" value={brand} onChangeText={setBrand} />

          <Stack gap="md">
            <Overline>per 100 g</Overline>
            <TextField
              label="Energy (kcal)"
              value={kcal}
              onChangeText={setKcal}
              keyboardType="decimal-pad"
            />
            <TextField
              label="Protein (g)"
              value={protein}
              onChangeText={setProtein}
              keyboardType="decimal-pad"
            />
            <TextField
              label="Carbohydrate (g)"
              value={carbs}
              onChangeText={setCarbs}
              keyboardType="decimal-pad"
            />
            <TextField
              label="Fat (g)"
              value={fat}
              onChangeText={setFat}
              keyboardType="decimal-pad"
            />
          </Stack>

          {!plausible ? (
            <Text variant="caption" tone="warning">
              Those macros do not add up to that energy figure. Worth a second look at the packet —
              though labels do vary, so carry on if it is right.
            </Text>
          ) : null}

          <Button
            label="Save and log it"
            onPress={submit}
            disabled={!complete || createFood.isPending}
            loading={createFood.isPending}
            variant="accent"
            size="large"
            fullWidth
            haptic
          />
        </Stack>
      </KeyboardAvoidingView>
    </Screen>
  );
}
