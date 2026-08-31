/**
 * Screen scaffolding: safe areas, background, and the two-column constraint
 * from NFR-U-01 — content is centred and capped in width on a tablet or desktop
 * browser rather than stretched across 1600 px.
 */
import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/** Beyond this, a single column of text stops being comfortable to read. */
const MAX_CONTENT_WIDTH = 720;

export interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Off for screens that own their own list. */
  scroll?: boolean;
  /** Extra bottom padding, for screens with a fixed action bar. */
  footerSpace?: number;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = false,
  footerSpace = 0,
  padded = true,
  style,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const content = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: MAX_CONTENT_WIDTH,
          alignSelf: 'center',
          ...(padded ? { paddingHorizontal: theme.space.lg } : {}),
          flex: scroll ? undefined : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>{content}</View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        paddingTop: theme.space.md,
        paddingBottom: insets.bottom + theme.space.xxl + footerSpace,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {content}
    </ScrollView>
  );
}

/**
 * A fixed bar at the bottom of a screen. NFR-U-02: primary controls live in the
 * lower part of the screen, reachable one-handed.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: theme.space.lg,
        paddingTop: theme.space.md,
        paddingBottom: insets.bottom + theme.space.md,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        gap: theme.space.sm,
      }}
    >
      <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: theme.space.sm }}>
        {children}
      </View>
    </View>
  );
}
