/**
 * Create an account (J1, step 1–2).
 *
 * Three fields and nothing else: units, experience and bodyweight are settings,
 * not a gate. J1's acceptance criterion is an exercise detail page within five
 * interactions of first launch, and a wizard would spend them all.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, router } from 'expo-router';
import { passwordSchema } from '@fi/shared';
import { ApiRequestError } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-context';
import { Button } from '../../src/components/Button';
import { Stack as VStack } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Overline, Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useSlowRequest, WAKING_MESSAGE } from '../../src/lib/use-slow-request';
import { useTheme } from '../../src/theme';

export default function SignUpScreen() {
  const theme = useTheme();
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const waking = useSlowRequest(submitting);

  // The same schema the API validates against — one rule, not two (NFR-M-02).
  const passwordProblem =
    password.length > 0 ? passwordSchema.safeParse(password).error?.issues[0]?.message : undefined;

  const canSubmit =
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    !passwordProblem &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await signUp({ email: email.trim(), password, displayName: displayName.trim() });
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
            <Overline>ARISE</Overline>
            <Text variant="display">Start training</Text>
            <Text tone="muted">Three fields. You can change everything else later.</Text>
          </VStack>

          <VStack gap="md">
            <TextField
              label="Name"
              value={displayName}
              onChangeText={setDisplayName}
              autoComplete="name"
              placeholder="What should we call you?"
              error={error?.fieldError('displayName')}
            />
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
              autoComplete="new-password"
              textContentType="newPassword"
              hint="At least 12 characters. A short phrase works well."
              error={passwordProblem ?? error?.fieldError('password')}
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error && !error.details.length ? (
              <Text tone="danger" accessibilityRole="alert">
                {error.code === 'CONFLICT'
                  ? 'There is already an account with that email.'
                  : error.isTransient
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
              label="Create account"
              onPress={submit}
              disabled={!canSubmit}
              loading={submitting}
              size="large"
              fullWidth
            />
          </VStack>

          <VStack gap="sm" style={{ alignItems: 'center' }}>
            <Link href="/(auth)/sign-in" asChild>
              <Text tone="accent" accessibilityRole="link">
                I already have an account
              </Text>
            </Link>
          </VStack>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
