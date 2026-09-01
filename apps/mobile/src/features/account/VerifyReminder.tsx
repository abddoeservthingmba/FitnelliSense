/**
 * The unverified-email reminder.
 *
 * The decision on record: an unverified account is fully functional, and gets a
 * reminder rather than a wall. So this is a banner, it is dismissible, and
 * dismissing it means something — it stays gone for a week rather than
 * reappearing on the next render, which is what makes it a reminder instead of
 * nagging.
 *
 * The dismissal is stored per device. It is a convenience, not a fact about the
 * account, so `localStorage`-style device storage is the right home for it and
 * a failed read simply shows the banner.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMe } from '../../api/hooks/use-profile';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';

const DISMISS_KEY = 'fi.verify-reminder.dismissed-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function VerifyReminder() {
  const theme = useTheme();
  const me = useMe();
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(DISMISS_KEY);
        const until = stored === null ? 0 : Number(stored);
        // A malformed value reads as 0, which shows the banner. Failing open is
        // right here: the worst case is one extra reminder.
        if (active) setHidden(Number.isFinite(until) && until > Date.now());
      } catch {
        if (active) setHidden(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const dismiss = () => {
    setHidden(true);
    void AsyncStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS)).catch(() => {
      // A device that cannot store the dismissal still gets it for this
      // session; there is nothing useful to tell the user about that.
    });
  };

  // `hidden === null` means the stored value has not been read yet. Rendering
  // nothing avoids a banner that flashes in and straight back out.
  if (hidden !== false || !me.data || me.data.emailVerified) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        padding: theme.space.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderLeftWidth: 3,
        borderColor: theme.colors.border,
        borderLeftColor: theme.colors.warning,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" weight="bold">
          Confirm your email
        </Text>
        <Text variant="caption" tone="muted">
          Everything works without it. Verifying just means we can reach you if
          you ever lose your password.
        </Text>
      </View>

      <View style={{ gap: theme.space.xs, alignItems: 'flex-end' }}>
        <Pressable
          onPress={() => router.push('/verify-email')}
          accessibilityRole="button"
          accessibilityLabel="Verify your email address"
          hitSlop={8}
        >
          <Text variant="caption" tone="accent" weight="bold">
            Verify
          </Text>
        </Pressable>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this reminder for a week"
          hitSlop={8}
        >
          <Text variant="caption" tone="faint">
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
