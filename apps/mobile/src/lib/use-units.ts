/**
 * The user's unit preference, in one hook.
 *
 * Screens never read `profile.units` directly; they ask for a formatter. That
 * keeps FR-WK-12 true by construction: kilograms everywhere, converted once, at
 * the point of display.
 */
import { useCallback, useMemo } from 'react';
import type { UnitSystem } from '@fi/domain';
import { useMe } from '../api/hooks/use-profile';
import {
  formatVolume,
  formatWeight,
  unitLabel,
  weightForInput,
  weightFromInput,
} from './format';

export interface Units {
  system: UnitSystem;
  label: 'kg' | 'lb';
  weight(weightKg: string | null): string;
  volume(volumeKg: string | null): string;
  toInput(weightKg: string | null): string;
  fromInput(value: string): string | null;
}

export function useUnits(): Units {
  const { data } = useMe();
  const system: UnitSystem = data?.profile.units ?? 'metric';

  const weight = useCallback((value: string | null) => formatWeight(value, system), [system]);
  const volume = useCallback((value: string | null) => formatVolume(value, system), [system]);
  const toInput = useCallback((value: string | null) => weightForInput(value, system), [system]);
  const fromInput = useCallback((value: string) => weightFromInput(value, system), [system]);

  return useMemo(
    () => ({ system, label: unitLabel(system), weight, volume, toInput, fromInput }),
    [system, weight, volume, toInput, fromInput],
  );
}
