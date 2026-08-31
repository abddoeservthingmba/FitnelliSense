/**
 * The rest timer (FR-WK-07, FR-WK-08, BRD §13.2).
 *
 * The timer's state is an end timestamp, not a counter. Everything else — the
 * number on screen, whether it has finished — is derived from `Date.now()`.
 * That is the only implementation that survives a backgrounded app, a locked
 * screen and a browser tab that stops firing intervals, on both platforms.
 *
 * On Android a local notification is scheduled for the end time, so the timer
 * still lands when the app is not in the foreground. On web that is not
 * reliable, so the UI says so rather than silently doing nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

const TICK_MS = 250;
const NOTIFICATION_CHANNEL = 'rest-timer';

export interface RestTimer {
  /** Seconds left, or null when no timer is running. */
  remainingSecs: number | null;
  totalSecs: number | null;
  isRunning: boolean;
  start(seconds: number): void;
  add(seconds: number): void;
  skip(): void;
}

async function scheduleEndNotification(seconds: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const permission = await Notifications.getPermissionsAsync();
    const granted =
      permission.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 100, 250],
      });
    }

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest over',
        body: 'Time for your next set.',
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
        channelId: NOTIFICATION_CHANNEL,
      },
    });
  } catch {
    // A timer that cannot notify is still a working timer.
    return null;
  }
}

function cancelNotification(id: string | null): void {
  if (!id) return;
  void Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

export function useRestTimer(): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSecs, setTotalSecs] = useState<number | null>(null);
  const [remainingSecs, setRemainingSecs] = useState<number | null>(null);
  const notificationId = useRef<string | null>(null);
  const alerted = useRef(false);

  /** Recomputes from the wall clock — the only source of truth for the timer. */
  const reconcile = useCallback(() => {
    if (endsAt === null) {
      setRemainingSecs(null);
      return;
    }
    const remaining = Math.max(0, (endsAt - Date.now()) / 1000);
    setRemainingSecs(remaining);

    if (remaining === 0 && !alerted.current) {
      alerted.current = true;
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [endsAt]);

  useEffect(() => {
    if (endsAt === null) return;
    reconcile();
    const interval = setInterval(reconcile, TICK_MS);
    return () => clearInterval(interval);
  }, [endsAt, reconcile]);

  // Coming back from the background must not show a stale number for a frame.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcile();
    });
    return () => subscription.remove();
  }, [reconcile]);

  useEffect(() => () => cancelNotification(notificationId.current), []);

  const start = useCallback((seconds: number) => {
    cancelNotification(notificationId.current);
    alerted.current = false;
    setTotalSecs(seconds);
    setEndsAt(Date.now() + seconds * 1000);
    void scheduleEndNotification(seconds).then((id) => {
      notificationId.current = id;
    });
  }, []);

  const add = useCallback(
    (seconds: number) => {
      if (endsAt === null) return;
      const nextEnd = Math.max(Date.now(), endsAt + seconds * 1000);
      cancelNotification(notificationId.current);
      alerted.current = false;
      setEndsAt(nextEnd);
      setTotalSecs((current) => (current === null ? null : Math.max(0, current + seconds)));
      void scheduleEndNotification((nextEnd - Date.now()) / 1000).then((id) => {
        notificationId.current = id;
      });
    },
    [endsAt],
  );

  const skip = useCallback(() => {
    cancelNotification(notificationId.current);
    notificationId.current = null;
    setEndsAt(null);
    setTotalSecs(null);
    setRemainingSecs(null);
  }, []);

  return {
    remainingSecs,
    totalSecs,
    isRunning: endsAt !== null && (remainingSecs ?? 0) > 0,
    start,
    add,
    skip,
  };
}

/** BRD §13.2: the web degradation is stated in the UI, never silently missing. */
export const BACKGROUND_ALERTS_SUPPORTED = Platform.OS !== 'web';
