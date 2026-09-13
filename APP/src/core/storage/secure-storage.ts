import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'planet.session.token';
const SESSION_USER_ID_KEY = 'planet.session.user-id';

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  // Session credentials must not survive a browser restart or remain in the
  // durable localStorage namespace. Native uses SecureStore below; the web
  // fallback is intentionally session-scoped until cookie-backed auth exists.
  return window.sessionStorage;
}

function legacyWebStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeLegacy(key: string): void {
  try {
    legacyWebStorage()?.removeItem(key);
  } catch {
    // A privacy-restricted browser may expose localStorage but reject writes.
  }
}

export async function readSessionToken(): Promise<string | null> {
  const storage = webStorage();
  if (storage) {
    // Remove credentials written by pre-hardening builds instead of silently
    // leaving a durable bearer token behind in existing browsers.
    removeLegacy(SESSION_TOKEN_KEY);
    return storage.getItem(SESSION_TOKEN_KEY);
  }
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
    removeLegacy(SESSION_TOKEN_KEY);
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
    removeLegacy(SESSION_TOKEN_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // Clearing an already unavailable store is safe to ignore.
  }
}

/** Cached only to identify this account's offline command queue while the API is unreachable. */
export async function readSessionUserId(): Promise<string | null> {
  const storage = webStorage();
  if (storage) {
    removeLegacy(SESSION_USER_ID_KEY);
    return storage.getItem(SESSION_USER_ID_KEY);
  }
  try {
    return await SecureStore.getItemAsync(SESSION_USER_ID_KEY);
  } catch {
    return null;
  }
}

export async function writeSessionUserId(userId: string): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.setItem(SESSION_USER_ID_KEY, userId);
    removeLegacy(SESSION_USER_ID_KEY);
    return;
  }
  await SecureStore.setItemAsync(SESSION_USER_ID_KEY, userId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionUserId(): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.removeItem(SESSION_USER_ID_KEY);
    removeLegacy(SESSION_USER_ID_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(SESSION_USER_ID_KEY);
  } catch {
    // Clearing an already unavailable store is safe to ignore.
  }
}
