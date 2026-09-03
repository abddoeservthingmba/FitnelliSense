/**
 * The signed-in shell.
 *
 * Six tabs. Routines folded into Exercises — they answer the same question —
 * which is the one merge that removed a destination rather than hiding one.
 *
 * History came back to the bar after being tried in the Train screen's header:
 * it is looked at often enough to deserve a permanent target, and a header
 * button on one screen is only reachable from that screen.
 *
 * Tab icons are drawn as glyphs rather than pulled from an icon package — one
 * less dependency, and they scale with the OS font size like everything else
 * (NFR-U-04).
 */
import { useEffect, useState } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { hasSeenOnboarding } from '@fi/shared';
import { useAuth } from '../../src/auth/auth-context';
import { useMe } from '../../src/api/hooks/use-profile';
import { Text } from '../../src/components/Text';
import { LaunchScreen } from '../../src/components/LaunchScreen';
import { TabFlourishProvider, useTabFlourish } from '../../src/features/nav/TabFlourish';
import { usePathSync } from '../../src/theme/path-context';
import {
  readOnboardingHint,
  rememberOnboarded,
  type OnboardingHint,
} from '../../src/auth/onboarding-hint';
import { useTheme } from '../../src/theme';

/** Order is the bar's order, and the index each flourish flies from. */
const TABS = [
  { name: 'index', title: 'Home', glyph: '◆' },
  { name: 'hunter', title: 'Hunter', glyph: '⬟' },
  { name: 'exercises', title: 'Train', glyph: '☰' },
  { name: 'food', title: 'Food', glyph: '◓' },
  { name: 'history', title: 'History', glyph: '◷' },
  { name: 'profile', title: 'Profile', glyph: '◍' },
] as const;

export default function TabsLayout() {
  const { status } = useAuth();
  const me = useMe();

  // The account's Path overrides the device's cached one once it is known.
  usePathSync(me.data?.profile.progressionPath);

  const [hint, setHint] = useState<OnboardingHint | null>(null);
  useEffect(() => {
    void readOnboardingHint().then(setHint);
  }, []);

  // Record it once the profile confirms it, so the next launch skips the wait.
  const onboarded = me.data ? hasSeenOnboarding(me.data.profile) : false;
  useEffect(() => {
    if (onboarded) void rememberOnboarded();
  }, [onboarded]);

  if (status === 'restoring') return <LaunchScreen />;
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;

  /*
   * The gate lives here, not after sign-up, so it follows the account rather
   * than the device: signing in on a second phone does not re-ask, and an
   * account that never reached the end of onboarding still gets there.
   *
   * It only WAITS, though, when the device has no idea. A device that has
   * onboarded before renders the tabs straight away and lets the profile land
   * behind them — otherwise every launch pays for a round trip that a cold
   * instance can take half a minute to answer. The redirect below still fires
   * if the hint turns out to be wrong.
   */
  if (hint === null) return <LaunchScreen />;
  if (hint === 'unknown' && me.isLoading) return <LaunchScreen />;
  if (me.data && !hasSeenOnboarding(me.data.profile)) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <TabFlourishProvider>
      <SignedInTabs />
    </TabFlourishProvider>
  );
}

/**
 * Split out because `useTabFlourish` has to read the context the provider
 * above establishes — a hook cannot see a provider rendered by the same
 * component.
 */
function SignedInTabs() {
  const theme = useTheme();
  const { play } = useTabFlourish();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          // Taller than the default. The bar is the app's spine and the old one
          // was a strip of small grey marks.
          height: Platform.OS === 'ios' ? 92 : 74,
          paddingTop: theme.space.sm,
          paddingBottom: Platform.OS === 'ios' ? theme.space.xl : theme.space.sm,
        },
        tabBarLabelStyle: {
          fontSize: theme.fontSize.micro,
          fontWeight: theme.fontWeight.semibold,
          letterSpacing: theme.tracking.wide,
        },
        tabBarItemStyle: { paddingVertical: theme.space.xs },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {TABS.map((tab, index) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <Text
                style={{
                  fontSize: theme.fontSize.title,
                  lineHeight: theme.fontSize.title * 1.2,
                  color: focused ? theme.colors.accent : theme.colors.textFaint,
                  textShadowColor: focused ? theme.colors.accent : 'transparent',
                  textShadowRadius: focused ? 12 : 0,
                  textShadowOffset: { width: 0, height: 0 },
                }}
              >
                {tab.glyph}
              </Text>
            ),
          }}
          listeners={{
            tabPress: () => play(tab.glyph, tab.title, index, TABS.length),
          }}
        />
      ))}
    </Tabs>
  );
}
