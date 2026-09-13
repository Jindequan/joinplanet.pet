import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../../ui/components/app-text';
import { Button } from '../../ui/components/button';
import { EmptyState } from '../../ui/components/empty-state';
import { Screen } from '../../ui/components/screen';
import { FadeInView } from '../../ui/motion';

export function AccountDeletedScreen() {
  const { theme } = useTheme();
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.brand}>
        <View
          style={[
            styles.orbit,
            {
              borderColor: theme.colors.sage,
              backgroundColor: theme.colors.sageSoft,
            },
          ]}
        >
          <View style={[styles.orbitDot, { backgroundColor: theme.colors.mintStrong }]} />
        </View>
        <AppText variant="heading" color={theme.colors.danger}>
          PLANET
        </AppText>
      </View>
      <FadeInView>
      <EmptyState
        title="账户已删除"
        description="你的 Planet 账户和相关访问权限已移除。如果以后改变主意，可以重新登录并创建新账户。"
        action={
          <Button label="返回登录" full onPress={() => router.replace('/auth' as never)} />
        }
      />
      </FadeInView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    marginTop: 24,
  },
  orbit: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
