/**
 * Password reset (FR-AUTH-06).
 *
 * Two steps, one screen. Splitting them across routes would mean carrying the
 * email address through navigation params — where it would sit in history —
 * and would let the user land on step two with nothing to submit.
 *
 * The address is never confirmed or denied. Step one always advances, because
 * telling someone whether an account exists is exactly the thing this screen
 * must not do.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, router } from 'expo-router';
import { ApiRequestError } from '../../src/api/client';
import {
  useConfirmPasswordReset,
  useRequestPasswordReset,
} from '../../src/api/hooks/use-verification';
import { Button } from '../../src/components/Button';
import { Stack } from '../../src/components/Card';
import { CodeField } from '../../src/components/CodeField';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useSlowRequest, WAKING_MESSAGE } from '../../src/lib/use-slow-request';
import { useTheme } from '../../src/theme';

/** Mirrors `passwordSchema` in the shared contracts. */
const MIN_PASSWORD = 12;

export default function ForgotPasswordScreen() {
  const theme = useTheme();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const request = useRequestPasswordReset();
  const confirm = useConfirmPasswordReset();
  const waking = useSlowRequest(request.isPending || confirm.isPending);

  const sendCode = () => {
    const address = email.trim();
    if (address.length === 0) return;
    setError(null);

    request.mutate(address, {
      // Advances whatever the answer, including for an address with no
      // account. That is the requirement, not an oversight.
      onSuccess: () => setStep('code'),
      onError: (caught) => {
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : 'We could not reach the server. Check your connection and try again.',
        );
      },
    });
  };

  const resetPassword = () => {
    setError(null);
    confirm.mutate(
      { email: email.trim(), code, password },
      {
        onSuccess: () => {
          // Every session was revoked server-side, so signing in again is not
          // optional — it is the only thing left to do.
          router.replace('/(auth)/sign-in');
        },
        onError: (caught) => {
          setCode('');
          setError(
            caught instanceof ApiRequestError
              ? caught.message
              : 'That reset could not be completed. Try again.',
          );
        },
      },
    );
  };

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const canReset = code.length === 6 && password.length >= MIN_PASSWORD && !confirm.isPending;

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="xxl" style={{ paddingTop: theme.space.xxl }}>
          <Stack gap="sm">
            <Overline>reset your password</Overline>
            <Text variant="heading">
              {step === 'email' ? 'Where should we send the code?' : 'Choose a new password'}
            </Text>
            <Text tone="muted">
              {step === 'email'
                ? 'We will email a six-digit code to the address on your account.'
                : `If ${email.trim()} has an account, the code is in its inbox.`}
            </Text>
          </Stack>

          {step === 'email' ? (
            <Stack gap="lg">
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!request.isPending}
                onSubmitEditing={sendCode}
                returnKeyType="send"
              />

              {error ? (
                <Text variant="caption" tone="danger">
                  {error}
                </Text>
              ) : null}
              {waking ? (
                <Text variant="caption" tone="muted">
                  {WAKING_MESSAGE}
                </Text>
              ) : null}

              <Button
                label="Send the code"
                onPress={sendCode}
                disabled={email.trim().length === 0 || request.isPending}
                loading={request.isPending}
                variant="accent"
                size="large"
                fullWidth
                haptic
              />
            </Stack>
          ) : (
            <Stack gap="lg">
              <CodeField value={code} onChangeText={setCode} label="Reset code" />

              <TextField
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!confirm.isPending}
                hint={`At least ${MIN_PASSWORD} characters. A phrase you will remember beats a puzzle you will not.`}
                error={passwordTooShort ? `Use at least ${MIN_PASSWORD} characters` : undefined}
              />

              {error ? (
                <Text variant="caption" tone="danger">
                  {error}
                </Text>
              ) : null}
              {waking ? (
                <Text variant="caption" tone="muted">
                  {WAKING_MESSAGE}
                </Text>
              ) : null}

              <Stack gap="sm">
                <Button
                  label="Set the new password"
                  onPress={resetPassword}
                  disabled={!canReset}
                  loading={confirm.isPending}
                  variant="accent"
                  size="large"
                  fullWidth
                  haptic
                />
                <Button
                  label="Send another code"
                  variant="secondary"
                  onPress={() => {
                    setCode('');
                    sendCode();
                  }}
                  disabled={request.isPending}
                  fullWidth
                />
                <Button
                  label="Use a different email"
                  variant="ghost"
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                  fullWidth
                />
              </Stack>

              <Text variant="caption" tone="faint">
                Changing your password signs you out everywhere else.
              </Text>
            </Stack>
          )}

          <View style={{ alignItems: 'center' }}>
            <Link href="/(auth)/sign-in" asChild>
              <Text variant="caption" tone="accent">
                Back to sign in
              </Text>
            </Link>
          </View>
        </Stack>
      </KeyboardAvoidingView>
    </Screen>
  );
}
