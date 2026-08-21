import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type StoredViewPreference =
  | { kind: 'all' }
  | { kind: 'family'; familyId: string }
  | { kind: 'pet'; petId: string };

function key(userId: string) {
  return `planet.view-preference.${userId}`;
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.localStorage;
}

function parse(value: string | null): StoredViewPreference | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredViewPreference>;
    if (parsed.kind === 'all') return { kind: 'all' };
    if (parsed.kind === 'family' && typeof parsed.familyId === 'string' && parsed.familyId) return { kind: 'family', familyId: parsed.familyId };
    if (parsed.kind === 'pet' && typeof parsed.petId === 'string' && parsed.petId) return { kind: 'pet', petId: parsed.petId };
  } catch {
    // A malformed local preference is disposable UI state.
  }
  return null;
}

export async function readViewPreference(userId: string): Promise<StoredViewPreference | null> {
  try {
    const storage = webStorage();
    if (storage) return parse(storage.getItem(key(userId)));
    return parse(await SecureStore.getItemAsync(key(userId)));
  } catch {
    return null;
  }
}

export async function writeViewPreference(userId: string, preference: StoredViewPreference): Promise<void> {
  try {
    const value = JSON.stringify(preference);
    const storage = webStorage();
    if (storage) {
      storage.setItem(key(userId), value);
      return;
    }
    await SecureStore.setItemAsync(key(userId), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // View preference is non-critical UI state; a storage failure must not
    // interrupt care actions or navigation.
  }
}
