/**
 * Loading, empty, error and offline states.
 *
 * Definition of Done item 4 requires all four on every screen, so they are
 * components rather than something each screen improvises. Every one of them
 * offers a way forward — no dead ends (BRD §1).
 */
import { ActivityIndicator, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { Stack } from './Card';
import { useTheme } from '../theme';
import { ApiRequestError } from '../api/client';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{ padding: theme.space.xxl, alignItems: 'center', gap: theme.space.md }}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator color={theme.colors.accent} />
      <Text variant="caption" tone="faint">
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <Stack gap="md" style={{ padding: theme.space.xl, alignItems: 'center' }}>
      <Text variant="title" center>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" center>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </Stack>
  );
}

/**
 * NFR-B-07/B-08: an offline failure is not an error. It reads as a temporary
 * connection problem with a retry, and never as "something went wrong".
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const theme = useTheme();
  const failure = error instanceof ApiRequestError ? error : null;

  // Three different situations, three different things to say. Only the first
  // is the user's to act on.
  const title = failure?.isOffline
    ? 'You’re offline'
    : failure?.isUnavailable
      ? 'Back in a moment'
      : 'That didn’t load';

  const body = failure?.isOffline
    ? 'Your workouts are safe. This will load as soon as you’re back online.'
    : failure?.isUnavailable
      ? 'The server is waking up or briefly unavailable. Nothing you logged is lost.'
      : (failure?.message ?? 'Something went wrong on our side.');

  return (
    <Stack gap="md" style={{ padding: theme.space.xl, alignItems: 'center' }}>
      <Text variant="title" center>
        {title}
      </Text>
      <Text tone="muted" center>
        {body}
      </Text>
      {error instanceof ApiRequestError && error.requestId ? (
        <Text variant="caption" tone="faint" center selectable>
          Reference: {error.requestId}
        </Text>
      ) : null}
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" /> : null}
    </Stack>
  );
}

/**
 * The unobtrusive indicator NFR-B-07 asks for: shown while a workout continues
 * against the local cache, rather than an error that interrupts logging.
 */
export function OfflineBanner({
  visible,
  reason = 'offline',
}: {
  visible: boolean;
  /** Which side of the connection is at fault; the reassurance is the same. */
  reason?: 'offline' | 'unavailable';
}) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.colors.dangerSoft,
        paddingVertical: theme.space.sm,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.sm,
      }}
    >
      <Text variant="caption" tone="danger">
        {reason === 'offline'
          ? 'Offline — keep logging. Your sets are saved here and will sync.'
          : 'Server unreachable — keep logging. Your sets are saved here and will sync.'}
      </Text>
    </View>
  );
}
