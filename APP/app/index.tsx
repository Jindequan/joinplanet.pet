import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '../src/core/providers/session-provider';
import { useTheme } from '../src/core/providers/theme-provider';
import { useActivation } from '../src/core/activation';
import { LoadingState } from '../src/ui/components/loading-state';

export default function Index() {
  const { status } = useSession();
  const { theme } = useTheme();
  const activation = useActivation({ enabled: status === 'authenticated' });

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <LoadingState label="正在恢复登录状态" />
      </View>
    );
  }

  if (status === 'authenticated') {
    if (activation.isLoading) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
          <LoadingState label="正在准备照护工作区" />
        </View>
      );
    }
    if (activation.phase !== 'ready') return <Redirect href="/activation" />;
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/auth" />;
}
