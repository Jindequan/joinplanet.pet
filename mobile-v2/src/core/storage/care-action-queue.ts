import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiError } from '../network/api-client';

const STORAGE_PREFIX = 'planet.pending-care-actions';
const LEGACY_STORAGE_KEY = STORAGE_PREFIX;

export type PendingCareAction = {
  userId: string;
  commandId: string;
  taskId: string;
  status: 'done' | 'skipped';
  date: string;
  note?: string;
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(userId)}`;
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.localStorage;
}

async function read(userId: string): Promise<PendingCareAction[]> {
  try {
    const storage = webStorage();
    const raw = storage ? storage.getItem(storageKey(userId)) : await SecureStore.getItemAsync(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingCareAction => Boolean(item) && typeof item === 'object' &&
      typeof (item as PendingCareAction).userId === 'string' &&
      (item as PendingCareAction).userId === userId &&
      typeof (item as PendingCareAction).commandId === 'string' &&
      typeof (item as PendingCareAction).taskId === 'string' &&
      ((item as PendingCareAction).status === 'done' || (item as PendingCareAction).status === 'skipped') &&
      typeof (item as PendingCareAction).date === 'string');
  } catch {
    return [];
  }
}

async function write(userId: string, items: PendingCareAction[]) {
  const serialized = JSON.stringify(items);
  const storage = webStorage();
  if (storage) {
    storage.setItem(storageKey(userId), serialized);
    return;
  }
  await SecureStore.setItemAsync(storageKey(userId), serialized);
}

// SecureStore/localStorage operations are not transactions. Serializing every
// read-modify-write prevents an AppState retry from racing a user tap.
let storageTail: Promise<void> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageTail.then(operation, operation);
  storageTail = result.then(() => undefined, () => undefined);
  return result;
}

export function discardLegacyCareActions() {
  return serialize(async () => {
    const storage = webStorage();
    if (storage) {
      storage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
    } catch {
      // An unavailable store should not prevent sign-in or care actions.
    }
  });
}

export function enqueueCareAction(action: PendingCareAction) {
  return serialize(async () => {
    const current = await read(action.userId);
    if (!current.some((item) => item.commandId === action.commandId)) {
      await write(action.userId, [...current, action]);
    }
  });
}

export function drainCareActions(
  userId: string,
  send: (action: PendingCareAction) => Promise<void>,
): Promise<{ remaining: number; synced: number }> {
  return serialize(async () => {
    let pending = await read(userId);
    let synced = 0;
    for (const action of pending) {
      try {
        await send(action);
        synced += 1;
      } catch (error) {
        // The server already accepted this command. It is safe to remove it
        // when the response was lost and a retry reports the duplicate.
        if (error instanceof ApiError && error.code === 'TASK_LOG_EXISTS') {
          synced += 1;
          pending = pending.slice(1);
          await write(userId, pending);
          continue;
        }
        // Preserve the failed action and everything after it. A network
        // outage should not cause later actions to overtake it.
        await write(userId, pending);
        return { remaining: pending.length, synced };
      }
      pending = pending.slice(1);
      // Persist after each command so a process kill cannot replay a long
      // queue from its beginning.
      await write(userId, pending);
    }
    return { remaining: pending.length, synced };
  });
}

export function pendingCareActionCount(userId: string) {
  return serialize(async () => (await read(userId)).length);
}
