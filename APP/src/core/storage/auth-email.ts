import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_EMAIL_KEY = 'planet.auth.email';

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export async function readAuthEmail(): Promise<string | null> {
  const storage = webStorage();
  if (storage) return storage.getItem(AUTH_EMAIL_KEY);
  try {
    return await SecureStore.getItemAsync(AUTH_EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function writeAuthEmail(email: string): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.setItem(AUTH_EMAIL_KEY, email);
    return;
  }
  await SecureStore.setItemAsync(AUTH_EMAIL_KEY, email);
}

export async function clearAuthEmail(): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.removeItem(AUTH_EMAIL_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(AUTH_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}
