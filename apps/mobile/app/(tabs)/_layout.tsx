/**
 * The signed-in shell: five tabs, matching the five things the product does.
 *
 * Tab icons are drawn as glyphs rather than pulled from an icon package —
 * one less dependency, and they scale with the OS font size like everything
 * else (NFR-U-04).
 */
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/auth/auth-context';
import { Text } from '../../src/components/Text';
import { LoadingState } from '../../src/components/StateViews';
import { useTheme } from '../../src/theme';

const TAB_GLYPHS = {
  index: '◆',
  exercises: '☰',
  routines: '▤',
  history: '◷',
  profile: '◍',
} as const;

export default function TabsLayout() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === 'restoring') return <LoadingState label="Getting things ready…" />;
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;

  const icon =
    (name: keyof typeof TAB_GLYPHS) =>
    ({ focused }: { focused: boolean }) => (
      <Text variant="callout" tone={focused ? 'accent' : 'faint'}>
        {TAB_GLYPHS[name]}
      </Text>
    );

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
        },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('index'), headerShown: false }}
      />
      <Tabs.Screen
        name="exercises"
        options={{ title: 'Exercises', tabBarIcon: icon('exercises'), headerShown: false }}
      />
      <Tabs.Screen
        name="routines"
        options={{ title: 'Routines', tabBarIcon: icon('routines'), headerShown: false }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: icon('history'), headerShown: false }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon('profile'), headerShown: false }}
      />
    </Tabs>
  );
}
