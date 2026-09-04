/**
 * Clearing the device-local preferences on sign-out.
 *
 * None of these are sensitive on their own — a sound toggle, a "this device has
 * onboarded" flag, and which Ascension to colour the app with before the
 * profile loads. But they are all facts about the PREVIOUS user, and leaving
 * them behind produced a small, real oddity: sign out, hand the phone to a
 * friend, and the app is still wearing your Ascension's colours until their
 * profile arrives — reading, to them, as though the app knew something about
 * them that it did not.
 *
 * The privacy policy states these are removed on sign-out. This is the code
 * that makes that sentence true, which is the only reason it is worth its own
 * module: the keys live in three different features, and a promise spread
 * across three files is a promise nobody maintains.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Every device-local preference key.
 *
 * Add to this list when adding a stored preference, or the policy quietly
 * stops being accurate.
 */
export const DEVICE_PREFERENCE_KEYS = [
  'arise.nav.sound',
  'arise.onboarded',
  'arise.ascension',
  'arise.tour',
] as const;

export async function clearDevicePreferences(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...DEVICE_PREFERENCE_KEYS]);
  } catch {
    // Sign-out must complete regardless. Failing to clear a colour preference
    // is not a reason to keep someone signed in.
  }
}

const TOUR_KEY = 'arise.tour';

/**
 * Whether the first-run tour has been shown on this device.
 *
 * Device-local rather than on the profile, because it is not worth a migration
 * and a column: seeing the tour twice costs a tap, and a reinstall showing it
 * again is arguably correct. It is cleared with everything else on sign-out,
 * so the next person on this phone gets shown around.
 */
export async function hasSeenTour(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TOUR_KEY)) === '1';
  } catch {
    // Unreadable storage means "show it" — a second tour is a smaller cost
    // than never explaining the app at all.
    return false;
  }
}

export async function rememberTourSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(TOUR_KEY, '1');
  } catch {
    // The tour will simply be offered again.
  }
}
