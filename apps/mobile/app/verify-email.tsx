/**
 * Email verification (FR-AUTH-06).
 *
 * The decision on record is that an unverified account is fully functional and
 * gets a dismissible reminder, so this screen is somewhere the user chooses to
 * go. It is not a gate, and it does not pretend to be one — nothing here blocks
 * the app, and "later" is a real answer.
 *
 * A code is requested on arrival rather than behind a button: the user opened
 * this screen to verify, so making them ask for the thing they came for is a
 * step for nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { ApiRequestError } from '../src/api/client';
import { useMe } from '../src/api/hooks/use-profile';
import {
  useConfirmVerification,
  useRequestVerificationCode,
} from '../src/api/hooks/use-verification';
import { Button } from '../src/components/Button';
import { Stack } from '../src/components/Card';
import { CodeField } from '../src/components/CodeField';
import { Screen } from '../src/components/Screen';
import { Overline, Text } from '../src/components/Text';
import { useTheme } from '../src/theme';

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const me = useMe();

  const requestCode = useRequestVerificationCode();
  const confirm = useConfirmVerification();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const requested = useRef(false);

  const email = me.data?.email;
  const alreadyVerified = me.data?.emailVerified === true;

  // One request on arrival. The ref, not a dependency array, is what makes it
  // once: a re-render must not send another email.
  useEffect(() => {
    if (requested.current || alreadyVerified || !me.data) return;
    requested.current = true;
    requestCode.mutate();
  }, [alreadyVerified, me.data, requestCode]);

  const submit = (value: string) => {
    setError(null);
    confirm.mutate(value, {
      onSuccess: () => setDone(true),
      onError: (caught) => {
        setCode('');
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : 'That code could not be checked. Try again.',
        );
      },
    });
  };

  const resend = () => {
    setCode('');
    setError(null);
    requestCode.mutate();
  };

  if (alreadyVerified || done) {
    return (
      <Screen>
        <Stack gap="xl" style={{ paddingTop: theme.space.xxl }}>
          <Stack gap="sm">
            <Overline tone="accent">verified</Overline>
            <Text variant="heading">That address is confirmed</Text>
            <Text tone="muted">
              {done
                ? 'Thanks — we know this inbox is yours, so we can reach you about your account.'
                : 'This address was already verified. Nothing more to do.'}
            </Text>
          </Stack>
          <Button label="Done" onPress={() => router.back()} fullWidth haptic />
        </Stack>
      </Screen>
    );
  }

  const deliveryConfigured = requestCode.data?.deliveryConfigured;
  const minutes = requestCode.data
    ? Math.max(1, Math.round(requestCode.data.expiresInSeconds / 60))
    : null;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="xxl" style={{ paddingTop: theme.space.xxl }}>
          <Stack gap="sm">
            <Overline>verify your email</Overline>
            <Text variant="heading">Enter the code we sent</Text>
            {email ? (
              <Text tone="muted">
                We sent six digits to <Text weight="bold">{email}</Text>
                {minutes === null ? '.' : `. It expires in ${minutes} minutes.`}
              </Text>
            ) : null}
          </Stack>

          {/* An honest message beats a wrong one: if the server cannot send
              email yet, say so rather than sending the user to an empty inbox. */}
          {deliveryConfigured === false ? (
            <View
              style={{
                padding: theme.space.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.warning,
                gap: theme.space.xs,
              }}
            >
              <Text variant="label" weight="bold">
                Email sending is not switched on yet
              </Text>
              <Text variant="caption" tone="muted">
                No code has been delivered. Your account works normally in the meantime — you can
                verify once this is configured.
              </Text>
            </View>
          ) : null}

          <CodeField
            value={code}
            onChangeText={setCode}
            onComplete={submit}
            error={error ?? undefined}
            editable={!confirm.isPending}
          />

          <Stack gap="sm">
            <Button
              label="Verify"
              onPress={() => submit(code)}
              disabled={code.length < 6 || confirm.isPending}
              loading={confirm.isPending}
              variant="accent"
              size="large"
              fullWidth
              haptic
            />
            <Button
              label={requestCode.isPending ? 'Sending…' : 'Send a new code'}
              variant="secondary"
              onPress={resend}
              disabled={requestCode.isPending}
              fullWidth
            />
            <Button label="Later" variant="ghost" onPress={() => router.back()} fullWidth />
          </Stack>

          <Text variant="caption" tone="faint">
            A new code replaces the previous one, so use the most recent email.
          </Text>
        </Stack>
      </KeyboardAvoidingView>
    </Screen>
  );
}
