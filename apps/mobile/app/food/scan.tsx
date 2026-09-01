/**
 * Barcode scanning — FR-NUT-05.
 *
 * The camera resolves a barcode to a *food*, and then hands over to the normal
 * quantity step. Scanning does not log anything by itself: a scan tells us what
 * the thing is, not how much of it was eaten.
 *
 * The permission is asked for at the moment it is needed and the refusal is a
 * real path, not a dead end — search and manual entry both still work, so a
 * declined camera costs the user a feature, not the screen.
 */
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Food, MealSlot } from '@fi/shared';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { LogFoodForm } from '../../src/features/nutrition/LogFoodForm';
import { localToday, useFoodByBarcode } from '../../src/api/hooks/use-nutrition';
import { useTheme } from '../../src/theme';

/** The formats actually found on food packaging. */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export default function ScanFoodScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ date?: string; mealSlot?: MealSlot }>();
  const date = params.date ?? localToday();

  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useFoodByBarcode();
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Food | null>(null);

  /**
   * The camera fires repeatedly while a barcode is in frame — several times a
   * second. Without this the same code would be looked up dozens of times.
   */
  const handled = useRef(false);

  const onScanned = (barcode: string) => {
    if (handled.current) return;
    handled.current = true;
    setError(null);

    lookup.mutate(barcode, {
      // The resolved food is held here and handed to the same quantity form
      // search uses, rather than passed through navigation params — a food does
      // not survive being flattened into a query string.
      onSuccess: setScanned,
      onError: () => {
        setError(
          'That barcode is not in the database. You can add the food yourself — it will be there next time.',
        );
        // Allow another attempt; the next scan is a fresh one.
        handled.current = false;
      },
    });
  };

  // A scan resolved to a food: ask how much, exactly as search does.
  if (scanned) {
    return (
      <Screen scroll>
        <LogFoodForm
          food={scanned}
          date={date}
          initialMealSlot={params.mealSlot ?? 'snack'}
          onLogged={() => router.dismissTo('/(tabs)/food')}
          onBack={() => setScanned(null)}
        />
      </Screen>
    );
  }

  if (!permission) {
    return (
      <Screen>
        <Stack gap="md" style={{ paddingTop: theme.space.xxl }}>
          <Text tone="muted">Checking the camera…</Text>
        </Stack>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Stack gap="xl" style={{ paddingTop: theme.space.xxl }}>
          <Stack gap="sm">
            <Overline>camera</Overline>
            <Text variant="heading">Scanning needs the camera</Text>
            <Text tone="muted">
              Only to read a barcode. Nothing is recorded or uploaded — the
              number goes to our server, which looks it up for you.
            </Text>
          </Stack>
          <Stack gap="sm">
            <Button
              label="Allow the camera"
              onPress={() => void requestPermission()}
              variant="accent"
              fullWidth
            />
            <Button
              label="Search by name instead"
              variant="secondary"
              onPress={() => router.back()}
              fullWidth
            />
          </Stack>
        </Stack>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={({ data }) => onScanned(data)}
      />

      <View
        style={{
          padding: theme.space.lg,
          gap: theme.space.md,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="label" weight="bold" center>
          {lookup.isPending ? 'Looking it up…' : 'Point at the barcode'}
        </Text>
        {error ? (
          <Text variant="caption" tone="danger" center accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
      </View>
    </View>
  );
}
