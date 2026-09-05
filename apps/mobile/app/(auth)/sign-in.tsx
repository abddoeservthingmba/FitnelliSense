/**
 * Sign in (FR-AUTH-01, FR-AUTH-03).
 *
 * One form, inline errors, and no modal alerts — a failed sign-in should never
 * cost the user what they typed.
 */
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, router } from 'expo-router';
import { ApiRequestError } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-context';
import { Button } from '../../src/components/Button';
import { GoogleSignInButton } from '../../src/features/auth/GoogleSignInButton';
import { Stack as VStack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useSlowRequest, WAKING_MESSAGE } from '../../src/lib/use-slow-request';
import { useTheme } from '../../src/theme';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  /*
   * Google has handed back a verified token; this is our own exchange for it.
   * A failure here is OUR server refusing — Google already succeeded — so the
   * message says that rather than blaming the Google account.
   */
  const onGoogleToken = useCallback(
    async (idToken: string) => {
      setGoogleBusy(true);
      setGoogleError(null);
      try {
        await signInWithGoogle(idToken);
      } catch (failure) {
        setGoogleError(
          failure instanceof ApiRequestError && failure.status === 409
            ? 'Google sign-in is not switched on for this server yet.'
            : 'That Google account could not be signed in. Try your password instead.',
        );
      } finally {
        setGoogleBusy(false);
      }
    },
    [signInWithGoogle],
  );
  const [submitting, setSubmitting] = useState(false);
  const waking = useSlowRequest(submitting);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn({ email: email.trim(), password });
      router.replace('/(tabs)');
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught
          : new ApiRequestError('INTERNAL', 'Something went wrong', 500),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <View style={{ paddingTop: theme.space.xxxl, gap: theme.space.xl }}>
          <VStack gap="sm">
            <Overline>ASCENSION</Overline>
            <Text variant="display">Welcome back</Text>
            <Text tone="muted">Pick up where your last session left off.</Text>
          </VStack>

          <VStack gap="md">
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              error={error?.fieldError('email')}
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
              returnKeyType="go"
              error={error?.fieldError('password')}
            />

            {error && !error.details.length ? (
              <Text tone="danger" accessibilityRole="alert">
                {error.isTransient
                  ? `${error.connectionMessage} Try again in a moment.`
                  : error.message}
              </Text>
            ) : null}

            {waking ? (
              <Text variant="caption" tone="muted" accessibilityRole="alert">
                {WAKING_MESSAGE}
              </Text>
            ) : null}

            <Button
              label="Sign in"
              onPress={submit}
              disabled={!canSubmit}
              loading={submitting}
              size="large"
              fullWidth
            />

            {/* Below the password form, not above it. Most people here already
                have a password account; Google is the alternative, not the
                default. The button renders nothing when the build has no
                client id. */}
            <GoogleSignInButton
              onToken={onGoogleToken}
              loading={googleBusy}
              error={googleError}
            />
          </VStack>

          <VStack gap="md" style={{ alignItems: 'center' }}>
            {/* Above "create an account", because someone who cannot get in
                usually already has one. */}
            <Link href="/(auth)/forgot-password" asChild>
              <Text tone="accent" accessibilityRole="link">
                Forgot your password?
              </Text>
            </Link>
            <Link href="/(auth)/sign-up" asChild>
              <Text tone="accent" accessibilityRole="link">
                Create an account
              </Text>
            </Link>
          </VStack>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
