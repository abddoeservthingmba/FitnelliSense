/** Signed-out screens. A signed-in user never sees them. */
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth/auth-context';
import { LoadingState } from '../../src/components/StateViews';

export default function AuthLayout() {
  const { status } = useAuth();

  if (status === 'restoring') return <LoadingState label="Signing you in…" />;
  if (status === 'signedIn') return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
