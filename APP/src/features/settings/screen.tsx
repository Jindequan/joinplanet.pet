import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Trash } from 'phosphor-react-native';
import { planetApi } from '../../core/api/planet-api';
import { errorMessage } from '../../core/api/errors';
import { invalidateAfterPreferencesChange } from '../../core/foundation';
import { queryKeys } from '../../core/query/keys';
import { useTheme } from '../../core/providers/theme-provider';
import { useToast } from '../../core/providers/toast-provider';
import { AppText } from '../../ui/components/app-text';
import { BackHeader } from '../../ui/components/back-header';
import { MoreGroup, MoreRow } from '../../ui/components/more';
import { OptionSheet, SelectField } from '../../ui/components/option-sheet';
import { PageHeader } from '../../ui/components/page-header';
import { LoadingState } from '../../ui/components/loading-state';
import { QueryErrorState } from '../../ui/components/query-error-state';
import { Screen } from '../../ui/components/screen';
import { useCapabilities } from '../../core/capabilities';
import { useScope } from '../../core/providers/scope-provider';
import { FadeInView } from '../../ui/motion';

export function SettingsScreen() {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const client = useQueryClient();
  const {
    caps,
    isLoading: capabilitiesLoading,
    error: capabilitiesError,
    refetch: refetchCapabilities,
  } = useCapabilities();
  const { resetToDefault } = useScope();
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
  const [petPickerOpen, setPetPickerOpen] = useState(false);

  const preferences = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  });
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  });
  const pets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => planetApi.pets.listAccessible(),
  });

  const availableFamilies = families.data?.families ?? [];
  const storedDefaultFamilyId = preferences.data?.preferences.default_family_id ?? '';
  const defaultFamilyId = availableFamilies.some((family) => family.id === storedDefaultFamilyId)
    ? storedDefaultFamilyId
    : '';
  const storedDefaultPetId = preferences.data?.preferences.default_pet_id ?? '';
  const activePets = (pets.data?.pets ?? []).filter((pet) => !pet.archived_at);
  const defaultFamilyPets = defaultFamilyId
    ? activePets.filter((pet) => (pet.family_ids ?? []).includes(defaultFamilyId))
    : activePets;
  const defaultPetId = defaultFamilyPets.some((pet) => pet.id === storedDefaultPetId)
    ? storedDefaultPetId
    : '';
  const defaultFamilyName =
    availableFamilies.find((family) => family.id === defaultFamilyId)?.name ?? '全部家庭';
  const defaultPetName =
    defaultFamilyPets.find((pet) => pet.id === defaultPetId)?.name ?? '不设默认';

  async function saveDefault(kind: 'family' | 'pet', value: string) {
    try {
      if (kind === 'pet' && value && defaultFamilyId) {
        const pet = activePets.find((item) => item.id === value);
        if (!pet?.family_ids?.includes(defaultFamilyId)) {
          showToast({ message: '这只宠物不属于当前默认家庭。' });
          return;
        }
      }
      const nextDefaultPetId =
        kind === 'family'
          ? value && defaultPetId && activePets.find((pet) => pet.id === defaultPetId)?.family_ids?.includes(value)
            ? defaultPetId
            : null
          : value || null;
      await planetApi.me.updatePreferences(
        kind === 'family'
          ? { default_family_id: value || null, default_pet_id: nextDefaultPetId }
          : { default_family_id: defaultFamilyId || null, default_pet_id: nextDefaultPetId },
      );
      const refreshed = await preferences.refetch();
      invalidateAfterPreferencesChange(client);
      await resetToDefault();
      if (refreshed.error) {
        showToast({ message: `默认项已保存，但设置页刷新失败：${errorMessage(refreshed.error)}` });
        return;
      }
      showToast({
        message:
          kind === 'family' && defaultPetId !== nextDefaultPetId
            ? '默认家庭已更新，原默认宠物不属于该家庭，已清除。'
            : '默认项已更新。',
      });
    } catch (e) {
      showToast({ message: errorMessage(e) });
    } finally {
      setFamilyPickerOpen(false);
      setPetPickerOpen(false);
    }
  }

  if (preferences.isLoading || families.isLoading || pets.isLoading) {
    return (
      <Screen>
        <BackHeader title="设置" fallbackHref="/more" />
        <PageHeader description="正在读取你的默认范围和通知设置。" />
        <LoadingState label="正在加载设置" />
      </Screen>
    );
  }

  const loadError = preferences.error ?? families.error ?? pets.error;
  if (loadError) {
    return (
      <Screen>
        <BackHeader title="设置" fallbackHref="/more" />
        <PageHeader description="默认范围暂时无法读取。" />
        <QueryErrorState
          error={loadError}
          onRetry={() => {
            void preferences.refetch();
            void families.refetch();
            void pets.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title="设置" fallbackHref="/more" />
      {capabilitiesError ? (
        <QueryErrorState
          message="功能开关暂时无法读取，通知入口可能暂时隐藏。"
          onRetry={() => void refetchCapabilities()}
        />
      ) : null}
      {capabilitiesLoading ? <LoadingState label="正在读取通知能力" compact /> : null}
      <PageHeader
        description={
          capabilitiesLoading
            ? '打开时默认显示的家庭和宠物；正在读取通知能力。'
            : caps.push_notifications
              ? '通知、打开时默认显示的家庭和宠物、恢复已删除内容。'
              : '打开时默认显示的家庭和宠物、恢复已删除内容。'
        }
      />

      <SettingsSummary
        familyName={defaultFamilyName}
        petName={defaultPetName}
        notificationsAvailable={caps.push_notifications}
        notificationsLoading={capabilitiesLoading}
      />

      <FadeInView>
      <MoreGroup label="常用">
        {caps.push_notifications ? (
          <MoreRow
            icon={<Bell size={19} color={theme.colors.forest2} weight="duotone" />}
            title="通知"
            sub="家庭照护提醒"
            href="/settings/notifications"
          />
        ) : null}
        <MoreRow
          icon={<Trash size={19} color={theme.colors.forest2} weight="duotone" />}
          title="已删除的家庭"
          sub="保护期内可以恢复"
          href="/settings/deleted-families"
        />
      </MoreGroup>

      <MoreGroup label="打开时显示">
        <View style={styles.inlineBlock}>
            <AppText variant="caption" muted style={styles.inlineLabel}>
            打开应用时默认看到谁；修改后当前范围也会更新
          </AppText>
          <View style={styles.inlineFields}>
            <SelectField
              label="家庭"
              value={defaultFamilyName}
              onPress={() => setFamilyPickerOpen(true)}
            />
            <SelectField
              label="宠物"
              value={defaultPetName}
              onPress={() => setPetPickerOpen(true)}
            />
          </View>
        </View>
      </MoreGroup>
      </FadeInView>

      <OptionSheet
        visible={familyPickerOpen}
        title="默认家庭"
        onClose={() => setFamilyPickerOpen(false)}
        options={[
          { value: '', label: '全部家庭' },
          ...availableFamilies.map((family) => ({
            value: family.id,
            label: family.name,
          })),
        ]}
        selected={defaultFamilyId}
        onSelect={(value) => void saveDefault('family', value)}
      />
      <OptionSheet
        visible={petPickerOpen}
        title="默认宠物"
        onClose={() => setPetPickerOpen(false)}
          options={[
          { value: '', label: '不设默认' },
          ...defaultFamilyPets.map((pet) => ({
            value: pet.id,
            label: pet.name,
          })),
        ]}
        selected={defaultPetId}
        onSelect={(value) => void saveDefault('pet', value)}
      />
    </Screen>
  );
}

function SettingsSummary({
  familyName,
  petName,
  notificationsAvailable,
  notificationsLoading,
}: {
  familyName: string;
  petName: string;
  notificationsAvailable: boolean;
  notificationsLoading: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[styles.summary, theme.shadow.card, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line, borderRadius: theme.radius.xl }]}
      accessible
      accessibilityLabel={`设置概览：默认家庭 ${familyName}，默认宠物 ${petName}`}
    >
      <AppText variant="eyebrow" color={theme.colors.forest2}>当前设置</AppText>
      <AppText variant="heading">打开应用会看到</AppText>
      <AppText variant="title" numberOfLines={1}>
        {familyName} · {petName}
      </AppText>
      <AppText variant="caption" muted>
        {notificationsLoading ? '正在读取通知能力…' : notificationsAvailable ? '通知按家庭分别设置' : '当前版本不提供设备推送'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    overflow: 'hidden',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 19,
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inlineBlock: {
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  inlineLabel: {
    fontWeight: '800',
  },
  inlineFields: {
    gap: 8,
  },
});
