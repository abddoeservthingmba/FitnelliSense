/**
 * Where the API lives.
 *
 * `EXPO_PUBLIC_API_URL` wins, so a preview build points at staging without a
 * code change; `app.json` holds the local default. On Android an emulator
 * cannot reach `localhost`, so that case is translated rather than left to fail
 * with a confusing network error.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_PREFIX } from '@fi/shared';

const ANDROID_EMULATOR_HOST = '10.0.2.2';

function configuredBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  const fromConfig = Constants.expoConfig?.extra?.apiBaseUrl;
  return typeof fromConfig === 'string' ? fromConfig : 'http://localhost:3000';
}

function forPlatform(url: string): string {
  if (Platform.OS !== 'android') return url;
  return url.replace('//localhost', `//${ANDROID_EMULATOR_HOST}`).replace(
    '//127.0.0.1',
    `//${ANDROID_EMULATOR_HOST}`,
  );
}

const resolvedOrigin = forPlatform(configuredBaseUrl()).replace(/\/$/, '');

/**
 * The classic broken-APK bug: a release build shipped pointing at `localhost`,
 * which on a phone means the phone itself. It installs, opens, and then fails
 * every request with no clue why.
 *
 * Caught at module load in release builds only, so it surfaces the moment the
 * build is opened rather than the first time someone tries to sign in.
 */
const POINTS_AT_THIS_DEVICE = /\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)\b/;

if (!__DEV__ && POINTS_AT_THIS_DEVICE.test(resolvedOrigin)) {
  throw new Error(
    `This build points at ${resolvedOrigin}, which resolves to the device itself. ` +
      'Set EXPO_PUBLIC_API_URL to the deployed API before building.',
  );
}

export const API_BASE_URL = `${resolvedOrigin}${API_PREFIX}`;

/**
 * A warm request answers in well under a second (NFR-P-02). This ceiling is not
 * about a warm request: the free hosting tier suspends the instance after a
 * quarter-hour idle, and waking it takes 30–60 seconds. Measured cold: 43s.
 *
 * At the old 15s the client aborted mid-wake and reported itself offline, so
 * anyone returning to the app after a break simply could not sign in. R1 and
 * NFR-R-06 both anticipate cold starts; the timeout has to allow for one.
 */
export const REQUEST_TIMEOUT_MS = 75_000;

/**
 * How long a request may take before the UI should explain itself. Past this,
 * silence reads as breakage, so screens show a "waking up" note rather than an
 * indefinite spinner.
 */
export const SLOW_REQUEST_HINT_MS = 4_000;
