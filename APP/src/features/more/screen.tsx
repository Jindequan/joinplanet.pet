import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  GearSix,
  House,
  TrendUp,
  UserCircle,
} from 'phosphor-react-native';
import { planetApi } from '../../core/api/planet-api';
import { queryKeys } from '../../core/query/keys';
import { useCapabilities } from '../../core/capabilities';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../../ui/components/app-text';
import { LoadingState } from '../../ui/components/loading-state';
import { MoreGroup, MoreRow } from '../../ui/components/more';
import { QueryErrorState } from '../../ui/components/query-error-state';
import { QueryRefreshState } from '../../ui/components/query-status';
import { Screen } from '../../ui/components/screen';
import { TabPageHero } from '../../ui/components/tab-page-hero';
import { FadeInView } from '../../ui/motion';

export function MoreScreen() {
  const { theme } = useTheme();
  const { caps } = useCapabilities();

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => planetApi.me.get(),
  });
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  });
  const user = me.data?.user;

  const familyCount = families.data?.families.length ?? 0;
  const familySub = families.isLoading
    ? '正在加载家庭信息'
    : families.error
      ? '家庭信息暂时无法更新'
      : familyCount
        ? `${familyCount} 个家庭 · 成员与邀请`
        : '创建或加入家庭';

  if (me.isLoading) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="账户" title="更多" subtitle="正在加载账户" />
        <LoadingState label="正在加载更多功能" />
      </Screen>
    );
  }

  if (me.error || !user) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="账户" title="更多" subtitle="加载失败" />
        <QueryErrorState
          error={me.error}
          message={me.error ? undefined : '无法加载账户信息'}
          onRetry={() => void me.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen inset="tabs">
      <TabPageHero
        eyebrow="账户"
        title="更多"
        subtitle={familyCount ? `${familyCount} 个家庭 · 管理家庭、趋势和设置` : '管理家庭、趋势和账户设置'}
      />
      <QueryRefreshState
        visible={
          families.isFetching && !families.isLoading
        }
        label="正在更新家庭信息"
      />

      <FadeInView index={0}>
      <View
        style={[styles.identity, theme.shadow.card, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line, borderRadius: theme.radius.xl }]}
      >
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: theme.colors.sageSoft,
              borderColor: theme.colors.lineStrong,
            },
          ]}
        >
          <AppText variant="heading" color={theme.colors.forest2}>
            {user.display_name.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <View style={styles.identityCopy}>
          <AppText variant="heading" numberOfLines={1}>
            {user.display_name}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {user.email}
          </AppText>
        </View>
      </View>
      </FadeInView>

      <FadeInView index={1}>
      <MoreGroup label="管理">
        <MoreRow
          icon={<House size={19} color={theme.colors.forest2} weight="duotone" />}
          title="家庭"
          sub={familySub}
          href="/families"
        />
        {families.error ? (
          <QueryErrorState
            embedded
            message="家庭信息暂时无法更新"
            onRetry={() => void families.refetch()}
          />
        ) : null}
        <MoreRow
          icon={<TrendUp size={19} color={theme.colors.forest2} weight="duotone" />}
          title="趋势"
          sub="完成率与体重"
          href="/trends"
        />
        <MoreRow
          icon={<GearSix size={19} color={theme.colors.forest2} weight="duotone" />}
          title="设置"
          sub={caps.push_notifications ? '通知、默认家庭和恢复已删除内容' : '默认家庭和恢复已删除内容'}
          href="/settings"
        />
      </MoreGroup>
      </FadeInView>

      <FadeInView index={2}>
        <MoreGroup label="账户">
          <MoreRow
            icon={<UserCircle size={19} color={theme.colors.forest2} weight="duotone" />}
            title="账户与安全"
            sub={`${user.display_name} · 个人资料、登录设备和退出`}
            href="/account"
          />
        </MoreGroup>
      </FadeInView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  identityCopy: { flex: 1, minWidth: 0, gap: 3 },
});
