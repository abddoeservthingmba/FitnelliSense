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

/** NFR-P-02 expects a fast API; a request hanging longer than this is a failure. */
export const REQUEST_TIMEOUT_MS = 15_000;
