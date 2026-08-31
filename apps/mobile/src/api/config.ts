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

export const API_BASE_URL = `${forPlatform(configuredBaseUrl()).replace(/\/$/, '')}${API_PREFIX}`;

/** NFR-P-02 expects a fast API; a request hanging longer than this is a failure. */
export const REQUEST_TIMEOUT_MS = 15_000;
