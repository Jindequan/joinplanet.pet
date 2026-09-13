import { useLocalSearchParams } from 'expo-router';
import { NotificationSettingsScreen } from '../../src/features/settings/notifications-screen';

export default function NotificationSettingsRoute() {
  const { familyId } = useLocalSearchParams<{ familyId?: string }>();
  return <NotificationSettingsScreen familyId={typeof familyId === 'string' ? familyId : undefined} />;
}
