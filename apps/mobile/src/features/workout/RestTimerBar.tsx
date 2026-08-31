/**
 * The rest timer, as it appears above the action bar during a workout.
 *
 * It shows a countdown, a progress line, and the two controls people actually
 * use mid-session: add a little time, or skip. When it finishes it stays
 * visible for a moment in a "rest over" state rather than vanishing, so a
 * glance after the set still answers the question.
 */
import { View } from 'react-native';
import { Button } from '../../components/Button';
import { Row } from '../../components/Card';
import { Text } from '../../components/Text';
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
        backgroundColor: finished ? theme.colors.accentSoft : theme.colors.surfaceRaised,
        borderRadius: theme.radius.md,
        padding: theme.space.md,
        gap: theme.space.sm,
      }}
    >
      <Row justify="space-between">
        <View>
          <Text variant="caption" tone="muted">
            {finished ? 'Rest over' : 'Resting'}
          </Text>
          <Text variant="metric" tone={finished ? 'accent' : 'default'}>
            {formatClock(remaining)}
          </Text>
        </View>

        <Row gap="sm">
          <Button label="+30s" size="small" variant="secondary" onPress={() => timer.add(30)} />
          <Button
            label={finished ? 'Done' : 'Skip'}
            size="small"
            variant={finished ? 'primary' : 'ghost'}
            onPress={timer.skip}
            haptic
          />
        </Row>
      </Row>

      <View
        style={{
          height: 3,
          borderRadius: 2,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.min(100, Math.max(0, progress * 100))}%`,
            height: '100%',
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>

      {!BACKGROUND_ALERTS_SUPPORTED && !finished ? (
        <Text variant="caption" tone="faint">
          Keep this tab open — the browser can’t alert you in the background.
        </Text>
      ) : null}
    </View>
  );
}
