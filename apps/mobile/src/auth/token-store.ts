/**
 * Token storage behind one interface, two adapters (BRD §13.2).
 *
 * Native uses SecureStore, which is Keystore-backed. Web has no equivalent, so
 * it uses AsyncStorage and the refresh token's short life and rotation
 * (FR-AUTH-04) carry the security argument instead. Feature code never branches
 * on platform.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: string;
}

const KEY = 'fi.session.v1';

interface SecretStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  clear(key: string): Promise<void>;
}

const secureStore: SecretStore = {
  read: (key) => SecureStore.getItemAsync(key),
  write: (key, value) => SecureStore.setItemAsync(key, value),
  clear: (key) => SecureStore.deleteItemAsync(key),
};

const webStore: SecretStore = {
  read: (key) => AsyncStorage.getItem(key),
  write: (key, value) => AsyncStorage.setItem(key, value),
  clear: (key) => AsyncStorage.removeItem(key),
};

const store: SecretStore = Platform.OS === 'web' ? webStore : secureStore;

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await store.read(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accessToken' in parsed &&
      'refreshToken' in parsed
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    // A corrupt or unreadable store means "not signed in", never a crash.
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await store.write(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await store.clear(KEY);
}
