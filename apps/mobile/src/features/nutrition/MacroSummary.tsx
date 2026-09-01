/**
 * Energy and macros against their targets.
 *
 * Bars rather than a ring: three macros plus energy is four quantities, and four
 * concentric rings is decoration that takes longer to read than a row of bars.
 *
 * When there is no target (FR-NUT-11, `origin: 'none'`) the bars are replaced by
 * the totals alone. A bar with nothing to fill toward would either sit empty or
 * imply a target we have not got.
 */
import { View } from 'react-native';
import { kjToKcal, targetFraction } from '@fi/domain';
import { Overline, Text } from '../../components/Text';
import { useTheme } from '../../theme';
import type { ThemeColors } from '../../theme/tokens';

export interface MacroSummaryProps {
  totals: { energyKj: number; proteinG: string; carbsG: string; fatG: string };
  targets: {
    energyKj: number;
    proteinG: string;
    carbsG: string;
    fatG: string;
    origin: 'estimated' | 'custom' | 'none';
    basis: string;
  };
}

const MACROS = [
  { key: 'proteinG', label: 'protein', colour: 'accent' },
  { key: 'carbsG', label: 'carbs', colour: 'highlight' },
  { key: 'fatG', label: 'fat', colour: 'monarch' },
] as const satisfies readonly {
  key: 'proteinG' | 'carbsG' | 'fatG';
  label: string;
  colour: keyof ThemeColors;
}[];

export function MacroSummary({ totals, targets }: MacroSummaryProps) {
  const theme = useTheme();
  const hasTarget = targets.origin !== 'none';

  return (
    <View style={{ gap: theme.space.lg }}>
      {/* Energy leads, because it is the number people look for. */}
      <View style={{ gap: theme.space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm }}>
          <Text variant="metric" tone="accent">
            {kjToKcal(totals.energyKj)}
          </Text>
          <Text variant="label" tone="muted">
            kcal
          </Text>
          {hasTarget ? (
            <Text variant="caption" tone="faint">
              of {kjToKcal(targets.energyKj)}
            </Text>
          ) : null}
        </View>
        {hasTarget ? (
          <Bar fraction={targetFraction(totals.energyKj, targets.energyKj)} colour="accent" />
        ) : null}
        <Text variant="micro" tone="faint">
          {totals.energyKj} kJ
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.space.md }}>
        {MACROS.map((macro) => {
          const actual = Number(totals[macro.key]);
          const target = Number(targets[macro.key]);
          return (
            <View key={macro.key} style={{ flex: 1, gap: 4 }}>
              <Overline>{macro.label}</Overline>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text variant="callout" weight="bold">
                  {Math.round(actual)}
                </Text>
                <Text variant="micro" tone="faint">
                  {hasTarget ? `/ ${Math.round(target)} g` : 'g'}
                </Text>
              </View>
              {hasTarget ? (
                <Bar fraction={targetFraction(actual, target)} colour={macro.colour} />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* FR-NUT-11: the screen always says where a target came from, and never
          presents one as advice. */}
      <Text variant="micro" tone="faint">
        {targets.basis}
      </Text>
    </View>
  );
}

function Bar({
  fraction,
  colour,
}: {
  fraction: number | null;
  colour: keyof ThemeColors;
}) {
  const theme = useTheme();
  if (fraction === null) return null;

  return (
    <View
      style={{
        height: 4,
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.round(fraction * 100)}%`,
          height: '100%',
          backgroundColor: theme.colors[colour],
        }}
      />
    </View>
  );
}
