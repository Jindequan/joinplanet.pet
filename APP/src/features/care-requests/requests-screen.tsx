import React from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { House } from 'phosphor-react-native'
import { foundationReaders } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useSession } from '../../core/providers/session-provider'
import { useResolvedScope, useScope } from '../../core/providers/scope-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { Card } from '../../ui/components/card'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { MoreRow } from '../../ui/components/more'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { ScopeCascade } from '../../ui/components/scope-cascade'
import { Screen } from '../../ui/components/screen'
import { TabPageHero } from '../../ui/components/tab-page-hero'
import { CareRequestInbox, type CareRequestView } from './panel'
import { ChoiceChips } from '../../ui/components/choice-chips'

/** 一级请求中心：Today 只保留任务上下文，这里承载全部回应与继续安排。 */
export function RequestsScreen() {
  const { theme } = useTheme()
  const { userId } = useSession()
  const { scope } = useScope()
  const resolvedScope = useResolvedScope()
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const accessiblePets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })
  const [view, setView] = React.useState<CareRequestView>('all')

  const scopedPets = (accessiblePets.data?.pets ?? []).filter((pet) => {
    if (scope.type === 'all') return !pet.archived_at
    if (scope.type === 'family') return !pet.archived_at && (pet.family_ids ?? []).includes(scope.id)
    return !pet.archived_at && pet.id === scope.id
  })
  const scopeReadOnly = Boolean(
    accessiblePets.data &&
      families.data &&
      scopedPets.length > 0 &&
      scopedPets.every((pet) => {
        const roles = scope.type === 'all'
          ? (pet.family_ids ?? []).map((familyId) =>
              pet.family_roles?.[familyId] ?? families.data?.families.find((family) => family.id === familyId)?.role,
            )
          : [
              scope.type === 'family'
                ? pet.family_roles?.[scope.id] ?? families.data?.families.find((family) => family.id === scope.id)?.role
                : scope.familyId
                  ? pet.family_roles?.[scope.familyId] ?? families.data?.families.find((family) => family.id === scope.familyId)?.role
                  : pet.access_role,
            ]
        return roles.length > 0 && roles.every((role) => role === 'viewer' || role === 'read_only')
    }),
  )
  const scopeLoading = families.isLoading || accessiblePets.isLoading
  const scopeDependencyError = families.error ?? accessiblePets.error

  return (
    <Screen inset="tabs">
      <TabPageHero
        eyebrow="协作"
        title="照护请求"
        subtitle="等你处理的，和你交给别人的照护事项"
        menu
      />
      <ScopeCascade variant="page" alwaysVisible />
      {scopeReadOnly ? (
        <View
          accessibilityLabel="当前范围只查看"
          style={[styles.readOnlyNotice, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}
        >
          <AppText variant="label" color={theme.colors.forest2}>当前范围只查看</AppText>
          <AppText variant="caption" muted>
            你可以查看请求和之前的安排；要回应或继续转交，请切换到可参与照护的家庭或宠物。
          </AppText>
        </View>
      ) : null}
      <ChoiceChips
        label="查看"
        options={[
          { value: 'all' as const, label: '全部' },
          { value: 'incoming' as const, label: '待我回应' },
          { value: 'sent' as const, label: '我发出的' },
        ]}
        value={view}
        onChange={setView}
      />

      {scopeLoading ? <LoadingState label="正在加载请求范围" /> : null}
      {scopeDependencyError ? (
        <QueryErrorState
          error={scopeDependencyError}
          message="家庭和宠物范围暂时无法更新，请重试。"
          onRetry={() => {
            void families.refetch()
            void accessiblePets.refetch()
          }}
        />
      ) : null}
      {!scopeLoading && !scopeDependencyError && resolvedScope.scopeError ? (
        <QueryErrorState
          error={resolvedScope.scopeError}
          message="家庭和宠物范围暂时无法更新，请重试。"
          onRetry={resolvedScope.retryScope}
        />
      ) : null}
      {!scopeLoading && !scopeDependencyError && !resolvedScope.scopeError && !resolvedScope.ready ? (
        <LoadingState label="正在确认请求范围" compact />
      ) : null}
      {!scopeLoading && !scopeDependencyError && resolvedScope.ready && resolvedScope.familySelectionRequired ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="label">先选择家庭</AppText>
          <AppText muted>
            这只宠物属于多个家庭。请在上面的范围选择器中先选一个家庭，再查看请求和批量安排。
          </AppText>
        </Card>
      ) : null}
      {!scopeLoading && !scopeDependencyError && !resolvedScope.scopeError && resolvedScope.ready && !resolvedScope.familySelectionRequired && (families.data?.families.length ?? 0) === 0 ? (
        <EmptyState
          title="还没有家庭"
          description="先创建或加入家庭，才能和其他成员一起安排宠物照护。"
          action={
            <MoreRow
              icon={<House size={19} weight="duotone" />}
              title="去家庭"
              sub="创建或加入家庭"
              onPress={() => router.push('/families' as never)}
            />
          }
        />
      ) : null}
      {!scopeLoading && !scopeDependencyError && !resolvedScope.scopeError && resolvedScope.ready && !resolvedScope.familySelectionRequired && (families.data?.families.length ?? 0) > 0 ? (
        <CareRequestInbox currentUserId={userId ?? 'anonymous'} showSent showEmptyState view={view} />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  readOnlyNotice: {
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
})
