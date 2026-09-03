/**
 * One line of encouragement, in the chosen Ascension's voice.
 *
 * Placed on a handful of screens rather than all of them. A quote on every page
 * stops being encouragement and becomes furniture — you learn to look past it
 * within a week, and then it is just something in the way of the numbers.
 *
 * The line is stable for the day (or for the session, where a workout id is
 * passed as the seed). Text that changes while you are reading it is worse
 * than no text, so `quoteFor` is deterministic and this component picks no
 * randomness of its own.
 */
import { View } from 'react-native';
import { quoteFor, type QuoteContext } from '@fi/domain';
import { Text } from '../../components/Text';
import { Reveal } from '../../components/Reveal';
import { AscensionSigil } from './AscensionSigil';
import { useTheme } from '../../theme';

export interface MotivationLineProps {
  context: QuoteContext;
  /**
   * What the line stays fixed for. A date holds it for the day; a workout id
   * holds it for the session. Defaults to today.
   */
  seed?: string;
  /** Shows the Ascension's mark beside it. Off by default — it is a line. */
  withSigil?: boolean;
}

export function MotivationLine({ context, seed, withSigil = false }: MotivationLineProps) {
  const theme = useTheme();
  const day = seed ?? new Date().toISOString().slice(0, 10);
  const line = quoteFor(theme.ascension.id, context, day);

  return (
    <Reveal delayMs={120}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
          paddingVertical: theme.space.sm,
          paddingHorizontal: theme.space.md,
          borderLeftWidth: 2,
          borderLeftColor: theme.colors.accent,
          backgroundColor: theme.colors.surface,
          borderTopRightRadius: theme.radius.sm,
          borderBottomRightRadius: theme.radius.sm,
        }}
      >
        {withSigil ? <AscensionSigil size={40} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted" style={{ fontStyle: 'italic' }}>
            {line}
          </Text>
          <Text variant="micro" tone="faint">
            {theme.ascension.systemLabel}
          </Text>
        </View>
      </View>
    </Reveal>
  );
}
