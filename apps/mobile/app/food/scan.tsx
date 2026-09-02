/**
 * Barcode scanning — FR-NUT-05.
 *
 * The camera resolves a barcode to a *food*, then hands over to the same
 * quantity step search uses. Scanning tells us what the thing is, not how much
 * of it was eaten.
 *
 * Three things here exist because "the scan does not work" is otherwise
 * impossible to diagnose from the outside:
 *
 *   1. **The detected digits are shown the instant the camera reads them.**
 *      That separates "the camera cannot see the barcode" from "the database
 *      has never heard of this product" — two completely different problems
 *      with the same symptom.
 *   2. **A manual entry field.** Barcodes on crumpled or shiny packaging
 *      defeat any scanner, and typing thirteen digits beats being stuck.
 *   3. **Not-found leads onward**, carrying the barcode into the custom-food
 *      form, so the next person to scan it gets the data.
 *
 * Open Food Facts coverage is thin outside Europe, and Indian products
 * especially so. A failed lookup is the expected case here, not an error.
 */
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Food, MealSlot } from '@fi/shared';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { LogFoodForm } from '../../src/features/nutrition/LogFoodForm';
import { localToday, useFoodByBarcode } from '../../src/api/hooks/use-nutrition';
import { useTheme } from '../../src/theme';

/**
 * The formats found on food packaging.
 *
 * EAN-13 is the one that matters almost everywhere; UPC-A is North America.
 * Deliberately not the whole list — QR and Data Matrix are not food barcodes,
 * and every extra format is more work per frame for the decoder.
 */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export default function ScanFoodScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ date?: string; mealSlot?: MealSlot }>();
  const date = params.date ?? localToday();
  const mealSlot = params.mealSlot ?? 'snack';

  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useFoodByBarcode();

  const [scanned, setScanned] = useState<Food | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [typing, setTyping] = useState(false);

  /**
   * The camera fires several times a second while a barcode is in frame.
   * Without this the same code would be looked up dozens of times.
   */
  const handled = useRef(false);

  const look = (barcode: string) => {
    setDetected(barcode);
    setNotFound(null);

    lookup.mutate(barcode, {
      onSuccess: (food) => {
        setScanned(food);
      },
      onError: () => {
        // Not an error state so much as the common one. Keep the number: it
        // is what makes the manual route worth anything.
        setNotFound(barcode);
        handled.current = false;
      },
    });
  };

  const onScanned = (barcode: string) => {
    if (handled.current || typing) return;
    handled.current = true;
    look(barcode);
  };

  // A scan resolved to a food: ask how much, exactly as search does.
  if (scanned) {
    return (
      <Screen scroll>
        <LogFoodForm
          food={scanned}
          date={date}
          initialMealSlot={mealSlot}
          onLogged={() => router.dismissTo('/(tabs)/food')}
          onBack={() => {
            setScanned(null);
            setDetected(null);
            handled.current = false;
          }}
        />
      </Screen>
    );
  }

  // ------------------------------------------------------- manual entry --

  if (typing || permission?.granted === false) {
    const digits = manual.replace(/\D/g, '');
    return (
      <Screen scroll>
        <Stack gap="xl" style={{ paddingTop: theme.space.xl }}>
          <Stack gap="sm">
            <Overline>barcode</Overline>
            <Text variant="heading">Type the number</Text>
            <Text tone="muted">
              {permission?.granted === false
                ? 'The camera is not available, so enter the digits under the barcode instead.'
                : 'The digits printed under the barcode. Usually 13 of them, sometimes 8.'}
            </Text>
          </Stack>

          <TextField
            label="Barcode"
            value={manual}
            onChangeText={setManual}
            keyboardType="number-pad"
            autoFocus
            hint={`${digits.length} digits`}
          />

          {notFound ? (
            <Text variant="caption" tone="warning">
              {notFound} is not in the food database. You can add it yourself and it will be there
              next time.
            </Text>
          ) : null}

          <Stack gap="sm">
            <Button
              label={lookup.isPending ? 'Looking it up…' : 'Look it up'}
              onPress={() => look(digits)}
              disabled={digits.length < 8 || lookup.isPending}
              loading={lookup.isPending}
              variant="accent"
              size="large"
              fullWidth
              haptic
            />
            <Button
              label="Add this food myself"
              variant="secondary"
              onPress={() =>
                router.replace({
                  pathname: '/food/custom',
                  params: { date, mealSlot, barcode: digits },
                })
              }
              fullWidth
            />
            {permission?.granted ? (
              <Button
                label="Use the camera instead"
                variant="ghost"
                onPress={() => {
                  setTyping(false);
                  setNotFound(null);
                  handled.current = false;
                }}
                fullWidth
              />
            ) : (
              <Button
                label="Allow the camera"
                variant="ghost"
                onPress={() => void requestPermission()}
                fullWidth
              />
            )}
          </Stack>
        </Stack>
      </Screen>
    );
  }

  // ---------------------------------------------------------- permission --

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
              Only to read a barcode. No photo is taken or stored — just the number, and only to our
              own server.
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
              label="Type the number instead"
              variant="secondary"
              onPress={() => setTyping(true)}
              fullWidth
            />
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
          </Stack>
        </Stack>
      </Screen>
    );
  }

  // -------------------------------------------------------------- camera --

  // The frame turns green the moment a code is decoded, which is the only
  // honest signal available: the decoder gives no "nearly there".
  const found = detected !== null;
  const frameColour = found ? theme.colors.success : theme.colors.textFaint;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={({ data }) => onScanned(data)}
        />

        {/* The reticle. `pointerEvents: none` so it never eats a tap meant
            for the camera surface underneath. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: '78%', aspectRatio: 1.6 }}>
            {CORNERS.map((corner) => (
              <View
                key={corner.key}
                style={{
                  position: 'absolute',
                  width: 44,
                  height: 44,
                  borderColor: frameColour,
                  ...corner.style,
                }}
              />
            ))}
          </View>
        </View>
      </View>

      <View
        style={{
          padding: theme.space.lg,
          gap: theme.space.sm,
          backgroundColor: theme.colors.surface,
        }}
      >
        {/*
          The digits, shown as soon as they are decoded. This is the line that
          makes a failure diagnosable: if a number appears, the camera works
          and the problem is the lookup.
        */}
        {detected ? (
          <Text variant="label" weight="bold" center tone={notFound ? 'warning' : 'success'}>
            {detected}
          </Text>
        ) : (
          <Text variant="label" weight="bold" center>
            Line the barcode up inside the frame
          </Text>
        )}

        {lookup.isPending ? (
          <Text variant="caption" tone="muted" center>
            Looking it up…
          </Text>
        ) : null}

        {notFound ? (
          <Stack gap="sm">
            <Text variant="caption" tone="muted" center>
              Scanned fine, but the food database has never heard of it. Coverage is thin outside
              Europe.
            </Text>
            <Button
              label="Add this food myself"
              variant="accent"
              onPress={() =>
                router.replace({
                  pathname: '/food/custom',
                  params: { date, mealSlot, barcode: notFound },
                })
              }
              fullWidth
              haptic
            />
          </Stack>
        ) : null}

        <Pressable onPress={() => setTyping(true)} accessibilityRole="button" hitSlop={8}>
          <Text variant="caption" tone="accent" center>
            Camera struggling? Type the number instead
          </Text>
        </Pressable>

        <Button label="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
      </View>
    </View>
  );
}

/** The four reticle corners, from one table so they cannot drift apart. */
const CORNERS = [
  { key: 'tl', style: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 } },
  { key: 'tr', style: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 } },
  { key: 'bl', style: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 } },
  { key: 'br', style: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 } },
] as const;
