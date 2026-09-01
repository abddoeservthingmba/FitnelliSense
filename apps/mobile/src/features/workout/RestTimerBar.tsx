/**
 * The rest timer, above the action bar during a workout.
 *
 * Editorial treatment because this is the one thing read at arm's length,
 * sweating, between sets: the countdown is the largest type in the app, tabular
 * so it does not jitter, on a full-width meter. When it finishes the block
 * inverts to the accent rather than disappearing — a glance a few seconds late
 * still answers the question.
 */
import { View } from 'react-native';
import { Button } from '../../components/Button';
import { Row } from '../../components/Card';
import { Meter } from '../../components/Section';
import { Overline, Text } from '../../components/Text';
import { formatClock } from '../../lib/format';
import { useTheme } from '../../theme';
import { BACKGROUND_ALERTS_SUPPORTED, type RestTimer } from './use-rest-timer';

export function RestTimerBar({ timer }: { timer: RestTimer }) {
  const theme = useTheme();

  if (timer.remainingSecs === null || timer.totalSecs === null) return null;

  const remaining = timer.remainingSecs;
  const finished = remaining <= 0;
  const progress = timer.totalSecs > 0 ? 1 - remaining / timer.totalSecs : 1;

  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={
        finished ? 'Rest finished' : `Rest timer, ${Math.ceil(remaining)} seconds remaining`
      }
      style={{
        backgroundColor: finished ? theme.colors.accent : theme.colors.surfaceRaised,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
      }}
    >
      <View style={{ padding: theme.space.lg, gap: theme.space.sm }}>
        <Row justify="space-between" align="flex-end">
          <View style={{ gap: 2 }}>
            <Overline tone={finished ? 'inverse' : 'faint'}>
              {finished ? 'Rest over — go' : 'Resting'}
            </Overline>
            <Text variant="metric" tone={finished ? 'inverse' : 'default'}>
              {formatClock(remaining)}
            </Text>
          </View>

          <Row gap="sm">
            <Button label="+30s" size="small" variant="secondary" onPress={() => timer.add(30)} />
            <Button
              label={finished ? 'Done' : 'Skip'}
              size="small"
              variant="ghost"
              onPress={timer.skip}
              haptic
            />
          </Row>
        </Row>

        {!BACKGROUND_ALERTS_SUPPORTED && !finished ? (
          <Text variant="caption" tone="faint">
            Keep this tab open — the browser can’t alert you in the background.
          </Text>
        ) : null}
      </View>

      <Meter progress={progress} tone={finished ? 'text' : 'accent'} height={4} />
    </View>
  );
}
