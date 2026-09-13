import React, { useState } from 'react'
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretRight, Users } from 'phosphor-react-native'
import { router } from 'expo-router'
import { planetApi, type TodayItem } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { ageText, sexLabel, speciesLabel } from '../../core/display'
import { invalidateAfterPetChange, foundationReaders, resolveTodayQuery } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { petsListSubtitle, petRowStatus } from '../../core/voice'
import { isCareDone, isCareOpen, isCareSkipped } from '../../core/presentation/care-status'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { PetAvatar } from '../../ui/components/pet-avatar'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { QueryRefreshState } from '../../ui/components/query-status'
import { Screen } from '../../ui/components/screen'
import { ScopeCascade } from '../../ui/components/scope-cascade'
import { TabPageHero } from '../../ui/components/tab-page-hero'
import { partitionPetList } from './model/list'
import { FadeInView, PressableScale } from '../../ui/motion'

export function PetsScreen() {
  const { theme } = useTheme()
  const { width: viewportWidth } = useWindowDimensions()
  const { showToast } = useToast()
  const { scope, setScope } = useScope()
  const client = useQueryClient()
  const [showDeleted, setShowDeleted] = useState(false)
  const wideLayout = Platform.OS === 'web' && viewportWidth >= 960

  const pets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const todayQuery = useQuery({
    queryKey: queryKeys.today({
      familyId: scope.type === 'family' ? scope.id : scope.type === 'pet' ? scope.familyId : undefined,
      petId: scope.type === 'pet' ? scope.id : undefined,
    }),
    queryFn: () => foundationReaders.today(resolveTodayQuery({
      scopeType: scope.type,
      scopeFamilyId: scope.type === 'family' ? scope.id : scope.type === 'pet' ? scope.familyId : undefined,
      scopePetId: scope.type === 'pet' ? scope.id : undefined,
      selectedDate: '',
      civilToday: '',
    })),
  })
  const deleted = useQuery({
    queryKey: ['deleted-pets'],
    queryFn: () => planetApi.pets.deleted(),
    enabled: showDeleted,
  })

  const rows = pets.data?.pets ?? []
  const rowsInScope = rows.filter((pet) => {
    if (scope.type === 'all') return true
    if (scope.type === 'family') return (pet.family_ids ?? []).includes(scope.id)
    return pet.id === scope.id
  })
  const activeRows = rowsInScope.filter((pet) => !pet.archived_at)
  const archivedCount = rowsInScope.length - activeRows.length
  const pendingByPet = new Map(
    (todayQuery.data?.pets ?? []).map((group) => [
      group.pet_id,
      group.items.filter(isCareOpen).length,
    ]),
  )
  const nextCareByPet = new Map(
    (todayQuery.data?.pets ?? []).map((group) => {
      const next = group.items.find(isCareOpen)
      return [group.pet_id, next?.task]
    }),
  )
  const progressByPet = new Map(
    (todayQuery.data?.pets ?? []).map((group) => {
      const completed = group.items.filter(isCareDone).length
      const skipped = group.items.filter(isCareSkipped).length
      return [group.pet_id, { completed, skipped, resolved: completed + skipped, total: group.items.length }]
    }),
  )
  const coverageByPet = new Map(
    (todayQuery.data?.pets ?? []).map((group) => [group.pet_id, petCoverageLabel(group.items)]),
  )
  const familyNameById = new Map((families.data?.families ?? []).map((family) => [family.id, family.name]))
  const hasFamilies = (families.data?.families.length ?? 0) > 0
  const scopedFamilyId = scope.type === 'family'
    ? scope.id
    : scope.type === 'pet'
      ? scope.familyId
      : undefined
  const scopedFamily = scopedFamilyId
    ? families.data?.families.find((family) => family.id === scopedFamilyId)
    : undefined
  const canCreatePet = scope.type === 'family' || (scope.type === 'pet' && scope.familyId)
    ? scopedFamily?.role === 'owner'
    : (families.data?.families ?? []).some((family) => family.role === 'owner')
  const createPetHref = scopedFamilyId
    ? `/pets/new?family_id=${encodeURIComponent(scopedFamilyId)}`
    : '/pets/new'

  function isReadOnlyInScope(pet: (typeof rowsInScope)[number]) {
    const role = scopedFamilyId
      ? pet.family_roles?.[scopedFamilyId] ?? families.data?.families.find((family) => family.id === scopedFamilyId)?.role
      : pet.access_role
    return role === 'viewer' || role === 'read_only'
  }

  function openPet(pet: (typeof rowsInScope)[number]) {
    const familyId = scope.type === 'family' && pet.family_ids?.includes(scope.id)
      ? scope.id
      : scope.type === 'pet' && scope.id === pet.id
        ? scope.familyId
        : undefined
    setScope({
      type: 'pet',
      id: pet.id,
      ...(familyId ? { familyId } : {}),
    })
    router.push(`/pets/${pet.id}${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}` as never)
  }

  function openTodayForPet(pet: (typeof rowsInScope)[number]) {
    const familyId = scope.type === 'family' && pet.family_ids?.includes(scope.id)
      ? scope.id
      : scope.type === 'pet' && scope.id === pet.id
        ? scope.familyId
        : undefined
    setScope({ type: 'pet', id: pet.id, ...(familyId ? { familyId } : {}) })
    router.push(`/(tabs)?pet_id=${encodeURIComponent(pet.id)}${familyId ? `&family_id=${encodeURIComponent(familyId)}` : ''}` as never)
  }

  if (pets.isLoading || families.isLoading) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="工作区" title="宠物" subtitle="正在加载档案" />
        <LoadingState label="正在加载宠物档案" />
      </Screen>
    )
  }

  if (pets.error || families.error) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="工作区" title="宠物" subtitle="加载失败" />
        <QueryErrorState
          error={pets.error ?? families.error}
          onRetry={() => {
            void pets.refetch()
            void families.refetch()
          }}
        />
      </Screen>
    )
  }

  const pendingTotal = activeRows.reduce((sum, pet) => sum + (pendingByPet.get(pet.id) ?? 0), 0)

  return (
    <Screen inset="tabs">
      <TabPageHero
        eyebrow="工作区"
        title="宠物"
        subtitle={
          todayQuery.error
            ? '档案列表正常，今天的待办数量无法更新'
            : petsListSubtitle(activeRows.length, archivedCount, pendingTotal)
        }
        trailing={
          canCreatePet ? (
            <Button
              label="添加"
              onPress={() => {
                if (!hasFamilies) router.push('/families' as never)
                else router.push(createPetHref as never)
              }}
              style={styles.addBtn}
            />
          ) : undefined
        }
        menu
      />
      <ScopeCascade variant="page" alwaysVisible />
      <QueryRefreshState
        visible={todayQuery.isFetching && Boolean(todayQuery.data)}
        label="正在更新今天的待办"
      />

      <PetsWorkspaceSummary
        active={activeRows.length}
        pending={pendingTotal}
        archived={archivedCount}
      />

      {todayQuery.error ? (
        <QueryErrorState
          message="今天的待办数量无法更新，宠物档案仍可查看。"
          onRetry={() => void todayQuery.refetch()}
        />
      ) : null}

      {rowsInScope.length === 0 ? (
        <EmptyState
          title={hasFamilies ? '还没有宠物' : '先有一个家庭'}
          description={
            hasFamilies && canCreatePet
              ? '添加第一只宠物，照护计划会跟着它走。'
              : hasFamilies
                ? '你可以参与现有宠物的照护；新增宠物需要家庭管理员处理。'
              : '先创建或加入家庭，再把这只宠物给成员一起看。'
          }
          action={
            <Button
              label={!hasFamilies ? '去家庭' : canCreatePet ? '添加宠物' : '查看家庭'}
              onPress={() =>
                router.push((hasFamilies && canCreatePet ? createPetHref : '/families') as never)
              }
            />
          }
        />
      ) : (
        <View style={[styles.petGrid, wideLayout ? styles.petGridWide : null]}>
          {partitionPetList(rowsInScope).map((section) => (
            <View key={section.key} style={styles.petSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderCopy}>
                  <AppText variant="heading">{section.key === 'active' ? '照护中的宠物' : section.title}</AppText>
                  <AppText variant="caption" muted>
                    {section.key === 'active' ? '先看今天有事要处理的宠物' : '保留历史记录，不再生成新的照护任务'}
                  </AppText>
                </View>
                <AppText variant="caption" muted>{section.pets.length} 只</AppText>
              </View>
              <View style={wideLayout ? styles.petCardsWide : styles.petCards}>
                {section.pets.map((pet, index) => {
                const age = ageText(pet.birth_date ?? undefined)
                const pending = pendingByPet.get(pet.id) ?? 0
                const nextCare = nextCareByPet.get(pet.id)
                const progress = progressByPet.get(pet.id) ?? { completed: 0, skipped: 0, resolved: 0, total: 0 }
                const coverage = coverageByPet.get(pet.id)
                const status = petRowStatus(Boolean(pet.archived_at), pending)
                const familyNames = (pet.family_ids ?? [])
                  .map((familyId) => familyNameById.get(familyId))
                  .filter(Boolean)
                const readOnlyInScope = isReadOnlyInScope(pet)
                return (
                  <FadeInView
                    key={pet.id}
                    index={index}
                    style={[
                      styles.petItem,
                      wideLayout
                        ? rowsInScope.length === 1
                          ? styles.petItemWideSingle
                          : styles.petItemWide
                        : null,
                    ]}
                  >
                <View
                  style={[
                    styles.petCard,
                    theme.shadow.card,
                    {
                      backgroundColor: theme.colors.paperStrong,
                      borderColor: theme.colors.line,
                      borderRadius: theme.radius.xl,
                      opacity: pet.archived_at ? 0.72 : 1,
                    },
                  ]}
                >
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`打开宠物 ${pet.name}`}
                    onPress={() => openPet(pet)}
                    style={styles.petCardMain}
                  >
                  <View style={styles.petCardTop}>
                    <View style={[styles.avatarFrame, { backgroundColor: pet.archived_at ? theme.colors.canvas : theme.colors.sageSoft }]}> 
                      <PetAvatar petId={pet.id} species={pet.species} size={72} />
                    </View>
                    <View style={styles.copy}>
                      <View style={styles.nameLine}>
                        <AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                          {pet.name}
                        </AppText>
                        <CaretRight size={20} color={theme.colors.soft} weight="bold" />
                      </View>
                      <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
                        {familyNames.length > 0 ? familyNames.join(' · ') : '未关联家庭'}
                      </AppText>
                    <AppText variant="caption" muted numberOfLines={2}>
                      {[
                        pet.breed || speciesLabel(pet.species),
                        [age, sexLabel(pet.sex)].filter(Boolean).join(' · '),
                      ]
                        .filter(Boolean)
                        .join(' · ') || '档案信息未填写'}
                    </AppText>
                      {pet.archived_at && status ? (
                        <View style={[styles.statusChip, { backgroundColor: pet.archived_at ? theme.colors.canvas : theme.colors.sageSoft }]}> 
                          <AppText variant="caption" color={pet.archived_at ? theme.colors.muted : theme.colors.forest2} numberOfLines={1}>
                          {status}
                          </AppText>
                        </View>
                      ) : null}
                      {readOnlyInScope && !pet.archived_at ? (
                        <View style={[styles.statusChip, { backgroundColor: theme.colors.sageSoft }]}>
                          <AppText variant="caption" color={theme.colors.forest2}>只查看</AppText>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {!pet.archived_at ? (
                    <View style={[styles.petCardStats, { borderTopColor: theme.colors.line, borderBottomColor: theme.colors.line }]}>
                      <View style={styles.petCardStat}>
                        <AppText variant="caption" muted>今日进度</AppText>
                        <AppText variant="label" color={pending > 0 ? theme.colors.coralDark : theme.colors.forest2}>
                          {progress.total > 0 ? `${progress.resolved}/${progress.total} 已处理` : '无安排'}
                        </AppText>
                      </View>
                      <View style={[styles.statDivider, { backgroundColor: theme.colors.line }]} />
                      <View style={styles.petCardStat}>
                        <AppText variant="caption" muted>还要处理</AppText>
                        <AppText variant="label" color={pending > 0 ? theme.colors.coralDark : theme.colors.forest2}>
                          {pending > 0 ? `${pending} 项` : progress.skipped > 0 ? `${progress.skipped} 项跳过` : '已完成'}
                        </AppText>
                      </View>
                    </View>
                  ) : null}
                  {!pet.archived_at && coverage ? (
                    <View style={styles.coverageLine}>
                      <Users size={15} color={theme.colors.forest2} weight="bold" />
                      <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
                        {coverage}
                      </AppText>
                    </View>
                  ) : null}

                  </PressableScale>

                  {!pet.archived_at && nextCare ? (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`去处理 ${pet.name} 的下一项照护：${nextCare.title}`}
                      onPress={() => openTodayForPet(pet)}
                      style={[styles.nextCare, { backgroundColor: theme.colors.sageSoft }]}
                    >
                      <View style={styles.nextCareHeader}>
                        <AppText variant="caption" color={theme.colors.forest2}>下一项 · {pet.name}</AppText>
                        <AppText variant="caption" color={theme.colors.forest2}>去处理 ›</AppText>
                      </View>
                      <View style={styles.nextCareLine}>
                        <AppText variant="label" color={theme.colors.forest2} numberOfLines={2} style={{ flex: 1 }}>
                          {nextCare.title}
                        </AppText>
                        {nextCare.time_of_day ? (
                          <AppText variant="caption" color={theme.colors.forest2}>{nextCare.time_of_day}</AppText>
                        ) : null}
                      </View>
                    </PressableScale>
                  ) : null}
                </View>
                  </FadeInView>
                )
              })}
            </View>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showDeleted ? '收起账户里已删除的宠物' : '查看账户里已删除的宠物'}
        onPress={() => setShowDeleted((value) => !value)}
        style={styles.deletedToggle}
      >
        <AppText variant="caption" color={theme.colors.forest2}>
          {showDeleted ? '收起账户里已删除的宠物' : '查看账户里已删除的宠物'}
        </AppText>
      </Pressable>

      {showDeleted ? (
        deleted.isLoading ? (
          <LoadingState label="正在加载已删除的宠物" compact />
        ) : deleted.error ? (
          <QueryErrorState
            error={deleted.error}
            message="已删除的宠物暂时无法更新。"
            onRetry={() => void deleted.refetch()}
          />
        ) : (deleted.data?.pets ?? []).length === 0 ? (
          <AppText muted>账户里没有可恢复的宠物档案。</AppText>
        ) : (
          <View style={{ gap: 10 }}>
            {(deleted.data?.pets ?? []).map((pet) => (
              <Card key={pet.id} style={styles.deletedRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="heading">{pet.name}</AppText>
                  <AppText variant="caption" muted>
                    已删除的档案
                  </AppText>
                </View>
                <Button
                  label="恢复"
                  variant="ghost"
                  onPress={async () => {
                    try {
                      await planetApi.pets.restore(pet.id)
                      await deleted.refetch()
                      invalidateAfterPetChange(client, pet.id)
                      showToast({ message: '宠物已恢复。' })
                    } catch (e) {
                      showToast({ message: errorMessage(e) })
                    }
                  }}
                />
              </Card>
            ))}
          </View>
        )
      ) : null}
    </Screen>
  )
}

function petCoverageLabel(items: TodayItem[]) {
  const pending = items.filter((item) => {
    return isCareOpen(item)
  })
  if (pending.length === 0) return ''

  let assigned = 0
  let waiting = 0
  let unassigned = 0
  const names = new Set<string>()
  for (const item of pending) {
    const request = item.care_request
    if (request?.state === 'sent' || request?.state === 'seen') {
      waiting += 1
      continue
    }
    if (request?.state === 'accepted' && request.target_user_name) {
      assigned += 1
      names.add(request.target_user_name)
      continue
    }
    if (request?.state === 'delegated' && request.next_target_user_name) {
      waiting += 1
      continue
    }
    if (item.task.assigned_to_name) {
      assigned += 1
      names.add(item.task.assigned_to_name)
    } else {
      unassigned += 1
    }
  }
  return [
    names.size > 0 ? `${[...names].slice(0, 2).join('、')}负责 ${assigned} 项` : '',
    waiting > 0 ? `等回应 ${waiting} 项` : '',
    unassigned > 0 ? `未分配 ${unassigned} 项` : '',
  ].filter(Boolean).join(' · ')
}

function PetsWorkspaceSummary({
  active,
  pending,
  archived,
}: {
  active: number
  pending: number
  archived: number
}) {
  const { theme } = useTheme()
  return (
    <View
      style={[styles.workspaceSummary, theme.shadow.card, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line, borderRadius: theme.radius.xl }]}
    >
      <View style={styles.workspaceSummaryTop}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="eyebrow" color={theme.colors.forest2}>宠物</AppText>
          <AppText variant="heading" numberOfLines={1}>
            {active > 0 ? `${active} 只宠物` : '还没有宠物'}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {pending > 0 ? `今天还有 ${pending} 项待处理` : '今天没有待处理事项'}
            {archived > 0 ? ` · ${archived} 只已归档` : ''}
          </AppText>
        </View>
        <View style={[styles.workspacePendingBadge, { backgroundColor: pending > 0 ? theme.colors.coralSoft : theme.colors.sageSoft }]}>
          <AppText variant="title" color={pending > 0 ? theme.colors.coralDark : theme.colors.forest2}>
            {pending}
          </AppText>
          <AppText variant="caption" color={pending > 0 ? theme.colors.coralDark : theme.colors.forest2}>
            待处理
          </AppText>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  addBtn: { paddingHorizontal: 14, minHeight: 44 },
  workspaceSummary: {
    overflow: 'hidden',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  workspaceSummaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  workspacePendingBadge: {
    minWidth: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  petGrid: {
    flexDirection: 'column',
    gap: 14,
  },
  petSection: {
    width: '100%',
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 4,
    paddingBottom: 2,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  activeSection: {
    width: '100%',
  },
  petGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  petCards: {
    width: '100%',
    gap: 10,
  },
  petCardsWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
  petCard: {
    gap: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  petCardMain: {
    gap: 14,
  },
  petCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  petItem: {
    width: '100%',
  },
  petItemWide: {
    width: '48.8%',
  },
  petItemWideSingle: {
    width: '100%',
  },
  avatarFrame: {
    width: 70,
    height: 70,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  petCardStats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  coverageLine: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 2,
  },
  petCardStat: {
    flex: 1,
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  nextCare: {
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nextCareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  nextCareLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  deletedToggle: { alignSelf: 'flex-start', paddingVertical: 8 },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
