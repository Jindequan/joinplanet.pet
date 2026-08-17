/**
 * Local task reminders (ROADMAP V1.5 wing 3, free tier) — thin silent-degrading
 * wrapper around expo-notifications.
 *
 * Scheduling: DAILY trigger at the task's HH:MM. The DAILY trigger has no
 * timezone option — it fires in the device's local timezone, not the circle's.
 * That is accepted for the free local tier (the Today list itself stays
 * circle-timezone authoritative); server-side push at circle time is Pro.
 *
 * Storage: task id → notification identifier map under 'planet_reminders'.
 * expo-secure-store on native (Keychain/Keystore); localStorage on web, where
 * secure-store has no implementation (same split as api.ts). Web never
 * schedules (no scheduler), so the web map is only a defensive fallback.
 *
 * Degrade discipline (haptics §78 applies here too): every entry point either
 * returns false/null or swallows — reminders must never break task creation.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const REMINDERS_KEY = 'planet_reminders';
const ANDROID_CHANNEL_ID = 'care-tasks';

/** Minimal task shape needed to schedule a reminder (TodayTask subset). */
export interface ReminderTask {
  id: string;
  title: string;
  /** HH:MM, 24-hour (contract F4 time_of_day). */
  time_of_day: string;
}

/* ------------------------- identifier map storage ------------------------- */

async function readIdentifierMap(): Promise<Record<string, string>> {
  const raw =
    Platform.OS === 'web' ? safeWebStorage('getItem') : await secureGet(REMINDERS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {}; // corrupt JSON — start over rather than break reminders
  }
}

async function writeIdentifierMap(map: Record<string, string>): Promise<void> {
  const raw = JSON.stringify(map);
  if (Platform.OS === 'web') {
    safeWebStorage('setItem', raw);
    return;
  }
  await SecureStore.setItemAsync(REMINDERS_KEY, raw);
}

function secureGet(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key).catch(() => null);
}

/** localStorage access that must never throw (private mode / SSR guards). */
function safeWebStorage(action: 'getItem', value?: string): string | null;
function safeWebStorage(action: 'setItem', value?: string): void;
function safeWebStorage(action: 'getItem' | 'setItem', value?: string): string | null {
  try {
    if (action === 'getItem') return window.localStorage.getItem(REMINDERS_KEY);
    if (value !== undefined) window.localStorage.setItem(REMINDERS_KEY, value);
  } catch {
    // storage unavailable — reminders map lives only until reload
  }
  return null;
}

/* ----------------------------- Android channel ----------------------------- */

let androidChannelReady = false;

/** Register (once per session) the Android notification channel for care tasks. */
async function ensureAndroidChannel(): Promise<void> {
  if (androidChannelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Care reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  androidChannelReady = true;
}

/* ------------------------------ public surface ----------------------------- */

/**
 * Ask for notification permission. Returns false on web (no local scheduler —
 * the browser Notification API is out of scope for this tier), when already
 * denied for good, or on any error. Never throws.
 */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * Schedule (or replace) the daily local reminder for a task. Fires at the
 * task's HH:MM in the device's local timezone (see header note). Returns the
 * notification identifier, or null when unsupported/unauthorized — callers
 * treat null as "no reminder, no error".
 */
export async function scheduleTaskReminder(task: ReminderTask): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(task.time_of_day.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  try {
    if (!(await ensurePermission())) return null;
    await ensureAndroidChannel();
    await cancelTaskReminder(task.id); // replace any previous schedule
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: `It's time for ${task.title}.`,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
    const map = await readIdentifierMap();
    map[task.id] = identifier;
    await writeIdentifierMap(map);
    return identifier;
  } catch {
    return null; // scheduler unavailable / permission revoked mid-flight
  }
}

/**
 * Cancel a task's scheduled reminder (no-op when none exists). Exported for
 * the Phase 2 "unset reminder" UI; also used internally before rescheduling.
 */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const map = await readIdentifierMap();
    const identifier = map[taskId];
    if (!identifier) return;
    await Notifications.cancelScheduledNotificationAsync(identifier);
    delete map[taskId];
    await writeIdentifierMap(map);
  } catch {
    // identifier unknown to the OS (reinstall, reboot) — nothing to cancel
  }
}
