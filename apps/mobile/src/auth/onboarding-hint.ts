/**
 * Remembers that this device has already finished onboarding.
 *
 * WHY THIS EXISTS. The signed-in shell used to hold the launch screen until
 * `/me` answered, because it needs the profile to decide between onboarding and
 * the tabs. That put a network round trip in front of every single launch — and
 * on a free Render instance that has spun down, the round trip is 25 to 45
 * seconds. The app was not slow to start; it was waiting, and looked broken.
 *
 * The hint removes the wait. If this device has been through onboarding, the
 * tabs render immediately from cache and the profile arrives behind them.
 *
 * It is a HINT, not an authority. The real check still runs when the profile
 * lands, and still redirects — so the worst a stale hint can do is show the
 * tabs for a moment before sending a genuinely new account to onboarding.
 * Storing it device-wide rather than per account is deliberate: it is not
 * sensitive, and it must be readable before we know who is signing in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'arise.onboarded';

export type OnboardingHint = 'unknown' | 'onboarded';

export async function readOnboardingHint(): Promise<OnboardingHint> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1' ? 'onboarded' : 'unknown';
  } catch {
    // Treat an unreadable cache as "no idea", which just restores the wait.
    return 'unknown';
  }
}

export async function rememberOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // Losing the hint costs a slow launch, not correctness.
  }
}

/**
 * Cleared on sign-out, so handing the phone to someone else does not skip
 * their onboarding.
 */
export async function forgetOnboarded(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
