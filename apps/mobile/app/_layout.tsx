/**
 * The root layout: providers, theming and the navigation shell.
 *
 * Deliberately thin. Auth redirection lives in the two group layouts, so this
 * file never has to know which screen a user should be on.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/auth/auth-context';
import { createQueryClient } from '../src/api/query-client';
import { ThemeProvider, useTheme } from '../src/theme';
import { AscensionProvider } from '../src/theme/ascension-context';

export default function RootLayout() {
  // One client for the app's lifetime; recreating it would drop every cache.
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* Outside ThemeProvider, which reads the Ascension to build the palette. */}
          <AscensionProvider>
            <ThemeProvider>
              <AuthProvider>
                <ThemedShell />
              </AuthProvider>
            </ThemeProvider>
          </AscensionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedShell() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: theme.fontWeight.semibold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
          /*
           * A slide with a dimmed, receding parent rather than the default
           * push. The outgoing screen staying put is what makes a stack feel
           * flat; letting it fall back under the incoming one gives the
           * navigation depth for the cost of one option.
           *
           * 260ms matches `Reveal`, so a screen's transition and its
           * content's entrance read as one movement.
           */
          animation: 'slide_from_right',
          animationDuration: 260,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        {/* No header and no back gesture: leaving is "Skip", not a swipe. */}
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen
          name="workout/active"
          options={{ title: 'Workout', headerBackTitle: 'Back' }}
        />
        <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
        <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
        <Stack.Screen
          name="exercise/new"
          options={{ title: 'New exercise', presentation: 'modal' }}
        />
        <Stack.Screen name="routine/[id]" options={{ title: 'Routine' }} />
        <Stack.Screen name="progress/[exerciseId]" options={{ title: 'Progress' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Ranking' }} />
        <Stack.Screen name="ascension" options={{ title: 'Your Ascension' }} />
        {/* Title comes from the screen itself — it is the athlete's name. */}
        <Stack.Screen name="athlete/[id]" options={{ title: 'Athlete' }} />
        <Stack.Screen name="food/add" options={{ title: 'Add food' }} />
        <Stack.Screen
          name="food/scan"
          options={{ title: 'Scan a barcode', presentation: 'modal' }}
        />
        <Stack.Screen name="food/custom" options={{ title: 'Add a food' }} />
        <Stack.Screen name="food/entry/[id]" options={{ title: 'Edit entry' }} />
        <Stack.Screen name="food/targets" options={{ title: 'Daily targets' }} />
        <Stack.Screen
          name="verify-email"
          options={{ title: 'Verify email', presentation: 'modal' }}
        />
      </Stack>
    </View>
  );
}
