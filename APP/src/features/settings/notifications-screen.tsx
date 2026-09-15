import React, { useState } from 'react';
import { AppState, Linking, Switch, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { planetApi } from '../../core/api/planet-api';
import { errorMessage } from '../../core/api/errors';
import { queryKeys } from '../../core/query/keys';
import { useTheme } from '../../core/providers/theme-provider';
import { useToast } from '../../core/providers/toast-provider';
import { AppText } from '../../ui/components/app-text';
import { BackHeader } from '../../ui/components/back-header';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { EmptyState } from '../../ui/components/empty-state';
import { LoadingState } from '../../ui/components/loading-state';
import { OptionSheet, SelectField } from '../../ui/components/option-sheet';
import { QueryErrorState } from '../../ui/components/query-error-state';
import { Screen } from '../../ui/components/screen';
import { useCapabilities } from '../../core/capabilities';
import { useSession } from '../../core/providers/session-provider';
import { FadeInView } from '../../ui/motion';

export function NotificationSettingsScreen({ familyId: routeFamilyId }: { familyId?: string } = {}) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const {
    caps,
    isLoading: capabilitiesLoading,
    error: capabilitiesError,
    refetch: refetchCapabilities,
  } = useCapabilities();
  const { pushStatus, refreshPushRegistration } = useSession();
  const [familyId, setFamilyId] = useState(routeFamilyId ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  });
  const preferences = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  });

  const availableFamilies = families.data?.families ?? [];
  const preferredFamilyId = preferences.data?.preferences.default_family_id;
  const hasPreferredFamily = Boolean(
    preferredFamilyId && availableFamilies.some((family) => family.id === preferredFamilyId),
  );
  const hasSelectedFamily = Boolean(familyId && availableFamilies.some((family) => family.id === familyId));
  const selectedFamilyId =
    (hasSelectedFamily ? familyId : '') ||
    (hasPreferredFamily ? preferredFamilyId : availableFamilies.length === 1 ? availableFamilies[0]?.id : '') ||
    '';
  const selectedFamily =
    availableFamilies.find((family) => family.id === selectedFamilyId) ?? null;
  const familySelectionReady = Boolean(selectedFamilyId && selectedFamily);

  const query = useQuery({
    queryKey: queryKeys.notificationPrefs(selectedFamilyId),
    queryFn: () => planetApi.families.notificationPrefs(selectedFamilyId),
    enabled: Boolean(selectedFamilyId) && caps.push_notifications,
  });

  const prefs = query.data?.prefs;

  async function toggle(kind: 'reminders' | 'digest' | 'alerts', value: boolean) {
    if (!familySelectionReady) {
      showToast({ message: '请先选择一个家庭。' });
      return;
    }
    try {
      await planetApi.families.updateNotificationPrefs(selectedFamilyId, { [kind]: value });
      const refreshed = await query.refetch();
      showToast({
        message: refreshed.error
          ? `通知偏好已保存，但页面刷新失败：${errorMessage(refreshed.error)}`
          : '通知偏好已保存。',
      });
    } catch (e) {
      showToast({ message: errorMessage(e) });
    }
  }

  return (
    <Screen>
      <BackHeader
        title="通知设置"
        fallbackHref="/settings"
        eyebrow="按家庭生效"
        subtitle={
          caps.push_notifications
            ? '关闭后不会再收到此类提醒'
            : '当前版本暂不提供推送提醒。'
        }
      />

      {capabilitiesLoading ? (
        <LoadingState label="正在读取通知能力" />
      ) : capabilitiesError ? (
        <QueryErrorState
          message="通知能力暂时无法读取，请重试。"
          onRetry={() => void refetchCapabilities()}
        />
      ) : !caps.push_notifications ? (
        <EmptyState
          title="当前没有推送提醒"
          description="你仍可在「今天」页查看待办；推送提醒开放后，会在这里按家庭设置。"
          />
      ) : families.isLoading ? (
        <LoadingState label="正在加载通知设置" />
      ) : families.error ? (
        <QueryErrorState error={families.error} onRetry={() => void families.refetch()} />
      ) : (families.data?.families.length ?? 0) === 0 ? (
        <EmptyState
          title="还没有家庭"
          description="创建或加入家庭后，即可按家庭设置通知。"
          action={
            <Button label="去家庭" onPress={() => router.push('/families' as never)} />
          }
        />
      ) : (
        <>
          <SelectField
            label="选择家庭"
            value={selectedFamily?.name ?? (families.isLoading ? '加载中…' : '选择家庭')}
            onPress={() => setPickerOpen(true)}
          />

          {pushStatus !== 'unsupported' ? (
            <PushDeviceStatus
              status={pushStatus}
              onRetry={refreshPushRegistration}
              theme={theme}
            />
          ) : null}

          <Card style={{ gap: 4, paddingVertical: 8 }}>
            {!familySelectionReady ? (
              <View style={[styles.infoRow, { backgroundColor: theme.colors.sageSoft }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">先选择家庭</AppText>
                  <AppText variant="caption" muted>
                    每个家庭分别设置提醒；选好后才会显示开关。
                  </AppText>
                </View>
              </View>
            ) : query.isLoading ? (
              <LoadingState label="正在加载家庭列表" compact />
            ) : query.error ? (
              <QueryErrorState embedded error={query.error} onRetry={() => void query.refetch()} />
            ) : (
              <FadeInView>
                <View style={styles.preferenceList}>
                  <View
                    style={[styles.infoRow, { backgroundColor: theme.colors.sageSoft }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">有人请你帮忙</AppText>
                      <AppText variant="caption" muted>
                        有人请你做一件事时，会收到可以直接处理的提醒。
                      </AppText>
                    </View>
                    <AppText variant="caption" color={theme.colors.forest2}>始终开启</AppText>
                  </View>
                  <PreferenceToggle
                    label="日常提醒"
                    description="到点提醒今天该做的照护"
                    value={Boolean(prefs?.reminders)}
                    onValueChange={(value) => void toggle('reminders', value)}
                    theme={theme}
                  />
                  <PreferenceToggle
                    label="每日照护摘要"
                    description="汇总当天做完、没做和交给其他人的事"
                    value={Boolean(prefs?.digest)}
                    onValueChange={(value) => void toggle('digest', value)}
                    theme={theme}
                  />
                  <PreferenceToggle
                    label="健康与照护预警"
                    description="出现异常变化或无人负责风险时提醒"
                    value={Boolean(prefs?.alerts)}
                    onValueChange={(value) => void toggle('alerts', value)}
                    theme={theme}
                  />
                </View>
              </FadeInView>
            )}
          </Card>
        </>
      )}

      <OptionSheet
        visible={pickerOpen}
        title="选择家庭"
        onClose={() => setPickerOpen(false)}
        options={availableFamilies.map((family) => ({
          value: family.id,
          label: family.name,
        }))}
        selected={selectedFamilyId}
        onSelect={(value) => {
          setFamilyId(value);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

function PushDeviceStatus({
  status,
  onRetry,
  theme,
}: {
  status: ReturnType<typeof useSession>['pushStatus'];
  onRetry: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const copy = {
    idle: ['设备通知', '登录后会登记这台设备。', '检查'],
    requesting: ['设备通知', '正在登记这台设备…', ''],
    ready: ['设备通知', '这台设备已登记，可以接收照护请求；如果系统没有显示按钮，点通知进入应用内处理。', '重新检查'],
    denied: ['设备通知', '系统通知权限没有打开，请在系统设置中允许 PLANET 通知。', '重试'],
    not_configured: ['设备通知', '发布配置还没有完成，暂时不能登记这台设备。', ''],
    failed: ['设备通知', '这台设备登记失败，网络恢复后可以重试。', '重试'],
    unsupported: ['设备通知', '当前平台不支持设备推送。', ''],
  } as const;
  const [label, description, action] = copy[status];
  const color = status === 'ready' ? theme.colors.forest2 : status === 'denied' || status === 'not_configured' || status === 'failed' ? theme.colors.coralDark : theme.colors.ink;

  React.useEffect(() => {
    if (status !== 'denied') return;
    // A permission change happens in the system Settings app. Re-check as
    // soon as the user returns so the status row updates without requiring a
    // second tap that would only open Settings again.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') onRetry();
    });
    return () => subscription.remove();
  }, [onRetry, status]);

  return (
    <View style={[styles.infoRow, { backgroundColor: status === 'ready' ? theme.colors.sageSoft : theme.colors.paper }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" color={color}>{label}</AppText>
        <AppText variant="caption" muted>{description}</AppText>
      </View>
      {action ? (
        <Button
          label={action}
          variant="secondary"
          busy={status === 'requesting'}
          onPress={() => {
            if (status === 'denied') {
              void Linking.openSettings();
              return;
            }
            onRetry();
          }}
          style={styles.statusButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  preferenceList: { gap: 4 },
  toggleRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  infoRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  statusButton: {
    minWidth: 76,
  },
});

function PreferenceToggle({
  label,
  description,
  value,
  onValueChange,
  theme,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" muted>
          {description}
        </AppText>
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={description}
        accessibilityState={{ checked: value }}
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.colors.canvas,
          true: theme.colors.mintStrong,
        }}
        thumbColor={theme.colors.paperStrong}
      />
    </View>
  );
}
