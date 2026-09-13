import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Semantic haptics — map product events to system feedback. */
export async function hapticLight() {
  if (Platform.OS === 'web') return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export async function hapticSuccess() {
  if (Platform.OS === 'web') return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export async function hapticWarning() {
  if (Platform.OS === 'web') return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export async function hapticSelection() {
  if (Platform.OS === 'web') return;
  await Haptics.selectionAsync();
}
