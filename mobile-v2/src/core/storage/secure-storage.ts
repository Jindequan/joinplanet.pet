import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'planet.session.token';

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.localStorage;
}

export async function readSessionToken(): Promise<string | null> {
  const storage = webStorage();
  if (storage) return storage.getItem(SESSION_TOKEN_KEY);
  try {
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function writeSessionToken(token: string): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.setItem(SESSION_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionToken(): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.removeItem(SESSION_TOKEN_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // Clearing an already unavailable store is safe to ignore.
  }
}
