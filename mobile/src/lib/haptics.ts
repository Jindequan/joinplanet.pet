/**
 * Haptics wrapper (spec §78): task complete → light, delete → warning.
 * Degrades silently on platforms/web without haptic support.
 */
import * as Haptics from 'expo-haptics';

async function silently(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // no haptic hardware / not supported — feedback must not break (spec §78)
  }
}

export const haptics = {
  /** General light tap (FAB press, selection). */
  light: () => silently(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Task complete → light (spec §78). */
  complete: () => silently(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium — row confirmations. */
  medium: () => silently(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Delete → warning (spec §78). */
  delete: () =>
    silently(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Success notification (share created, export done). */
  success: () =>
    silently(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Selection tick (chips, segmented control). */
  select: () => silently(() => Haptics.selectionAsync()),
};

export type HapticsApi = typeof haptics;
