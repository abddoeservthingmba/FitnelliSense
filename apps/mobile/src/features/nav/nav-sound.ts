/**
 * The navigation sound's preference and audio session.
 *
 * Two decisions here matter more than the sound itself, because this app is
 * used in a gym with headphones in:
 *
 * - `mixWithOthers` — the effect plays OVER whatever music is on, without
 *   ducking or pausing it. Ducking someone's track on every tab press would
 *   make the sound the app's most memorable feature, for the wrong reason.
 * - `playsInSilentMode: false` — a phone switched to silent stays silent.
 *   A UI flourish is not important enough to override that.
 *
 * The preference is per device, not per account: whether you want sound
 * depends on where you are, not who you are.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync } from 'expo-audio';

const KEY = 'arise.nav.sound';

/** On by default — it is a deliberate part of the feel, not an opt-in extra. */
export const NAV_SOUND_DEFAULT = true;

export async function loadNavSound(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return stored === null ? NAV_SOUND_DEFAULT : stored === '1';
  } catch {
    // A preference is not worth an error state. Fall back to the default.
    return NAV_SOUND_DEFAULT;
  }
}

export async function saveNavSound(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    // Ignored: the toggle still works for this session.
  }
}

/**
 * Configures the audio session once, at startup.
 *
 * Safe to call when the module is unavailable — on web there is no session to
 * configure, and a failure here must never stop the app from loading.
 */
export async function configureNavAudio(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Sound is decoration. Losing it silently is correct (FR-AI-08's spirit:
    // the extras degrade, the app does not).
  }
}
