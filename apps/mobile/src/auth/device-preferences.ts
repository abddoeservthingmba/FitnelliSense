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
] as const;

export async function clearDevicePreferences(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...DEVICE_PREFERENCE_KEYS]);
  } catch {
    // Sign-out must complete regardless. Failing to clear a colour preference
    // is not a reason to keep someone signed in.
  }
}
