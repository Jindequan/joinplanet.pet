import React, { useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardText,
  Clock,
  CaretRight,
  DownloadSimple,
  GearSix,
  House,
  Info,
  ShareNetwork,
  Stethoscope,
  Trash,
  Users,
  WarningCircle,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import {
  planetApi,
  type Family,
  type Pet,
  type Profile,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import {
  ageText,
  civilDateLabel,
  sexLabel,
  speciesLabel,
  weightKg,
} from '../../core/display'
import { queryKeys } from '../../core/query/keys'
import { extensionReaders } from '../../core/extension'
import { foundationReaders, invalidateAfterPetChange, resolveTodayQuery } from '../../core/foundation'
import { useCapabilities } from '../../core/capabilities'
import { useSession } from '../../core/providers/session-provider'
import { resolvePetTimezone, useScope } from '../../core/providers/scope-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ChoiceChips } from '../../ui/components/choice-chips'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { LoadingState } from '../../ui/components/loading-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { MoreGroup, MoreRow } from '../../ui/components/more'
import { PetAvatar } from '../../ui/components/pet-avatar'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { FadeInView, hapticSelection, PressableScale } from '../../ui/motion'
import { CareSection } from './care-section'
import { MedicationsSection } from './medications-section'
import { profileContactRows, profileLines, profileObjectName } from './profile-helpers'
import { SharingSection } from './sharing-section'
import type { PetWorkspaceTab } from './types'
import { describeEvent } from '../timeline/registry'
import { formatClockInTimeZoneSafe } from '../timeline/time'
import { isCareOpen } from '../../core/presentation/care-status'

type Props = {
  petId: string
  tab?: PetWorkspaceTab
  /** Deep links may carry the family edge that opened this pet workspace. */
  familyId?: string
}

export function PetDetailScreen({ petId, tab = 'overview', familyId: routeFamilyId }: Props) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { scope, setScope } = useScope()
  const { caps } = useCapabilities()
  const { userId } = useSession()
  const client = useQueryClient()
  const [confirm, setConfirm] = useState<'delete' | 'archive' | null>(null)
  const [vetSummarySignal, setVetSummarySignal] = useState(0)

  const petQuery = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => foundationReaders.pet(petId),
    enabled: Boolean(petId),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const preferences = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  })

  const petForScope = petQuery.data?.pet
  const routeScopeKey = `${petId}:${routeFamilyId ?? ''}`
  const appliedRouteScopeKey = useRef<string | null>(null)
  const routeFamilyIsLinked = Boolean(
    routeFamilyId && petForScope?.family_ids?.includes(routeFamilyId),
  )
  const routeContextPending = Boolean(
    routeFamilyIsLinked && appliedRouteScopeKey.current !== routeScopeKey,
  )

  useEffect(() => {
    if (!routeFamilyId || !petForScope) return
    if (appliedRouteScopeKey.current === routeScopeKey) return
    appliedRouteScopeKey.current = routeScopeKey
    if (routeFamilyIsLinked) {
      setScope({ type: 'pet', id: petId, familyId: routeFamilyId })
    }
  }, [petForScope, petId, routeFamilyId, routeFamilyIsLinked, routeScopeKey, setScope])

  const scopedFamilyId = scope.type === 'family'
    ? scope.id
    : scope.type === 'pet'
      ? scope.familyId
      : undefined
  const preferredFamilyId = routeContextPending
    ? routeFamilyId
    : scopedFamilyId && petForScope?.family_ids?.includes(scopedFamilyId)
    ? scopedFamilyId
    : preferences.data?.preferences.default_family_id && petForScope?.family_ids?.includes(preferences.data.preferences.default_family_id)
      ? preferences.data.preferences.default_family_id
      : petForScope?.family_ids?.length === 1
        ? petForScope.family_ids[0]
        : undefined
  const todayFamilyId = preferredFamilyId
  const todayFamilyName = families.data?.families.find((family) => family.id === todayFamilyId)?.name
  const todayFamilySelectionRequired = Boolean(
    (petForScope?.family_ids?.length ?? 0) > 1 && !todayFamilyId,
  )
  const scopeDependencyError =
    (!families.data && families.error) ||
    (!preferences.data && preferences.error) ||
    undefined
  const todayQuery = useQuery({
    queryKey: queryKeys.today({ petId, familyId: todayFamilyId }),
    queryFn: () => foundationReaders.today(resolveTodayQuery({
      scopeType: 'pet',
      scopeFamilyId: todayFamilyId,
      scopePetId: petId,
      selectedDate: '',
      civilToday: '',
    })),
    enabled: Boolean(petQuery.data) && !todayFamilySelectionRequired && !scopeDependencyError,
  })
  const recentTimeline = useQuery({
    queryKey: ['timeline', 'pet-recent', petId],
    queryFn: () => foundationReaders.timeline({ pet_id: petId, limit: 3 }),
    enabled: Boolean(petQuery.data),
  })

  if (petQuery.isLoading) {
    return (
      <Screen>
        <BackHeader title="宠物" fallbackHref="/pets" />
        <LoadingState label="正在加载宠物档案" />
      </Screen>
    )
  }
  if (petQuery.error || !petQuery.data) {
    return (
      <Screen>
        <BackHeader title="宠物" fallbackHref="/pets" />
        <QueryErrorState
          error={petQuery.error}
          message={petQuery.error ? undefined : '这只宠物不存在或对你不可见'}
          onRetry={() => void petQuery.refetch()}
        />
      </Screen>
    )
  }

  const { pet, profile } = petQuery.data
  const linkedFamiliesForScope = (families.data?.families ?? []).filter((family) =>
    (pet.family_ids ?? []).includes(family.id),
  )
  const isPetOwner = Boolean(userId && pet.current_owner_user_id === userId)
  const scopedRole = todayFamilyId
    ? pet.family_roles?.[todayFamilyId] ?? families.data?.families.find((family) => family.id === todayFamilyId)?.role
    : pet.access_role
  const readOnly = !scopedRole || scopedRole === 'viewer' || scopedRole === 'read_only'
  const writesLocked = readOnly || Boolean(pet.archived_at)
  // A Family owner governs that Family's standing care system. The Pet owner
  // also retains control, while caregivers only execute assigned occurrences.
  const canManagePlans = !pet.archived_at && (isPetOwner || scopedRole === 'owner')
  // Medication history is part of the Pet record, not a Family task. A
  // direct Pet editor may maintain it; a Family caregiver can still see it
  // and execute any medication plan assigned to them.
  // Once a family is selected, the family edge is the source of truth. Using
  // the aggregate access_role here let a direct editor grant from another
  // family leak an edit button into this household (and hid a valid editor
  // grant in the opposite direction).
  const canManagePetRecord = !pet.archived_at && (isPetOwner || scopedRole === 'editor')
  // Record editors can maintain approved health details. Ownership, family
  // links and external shares remain Pet-owner-only. A linked Family owner
  // also governs lifecycle (archive/delete) for that organization's Pet.
  const canManagePet = !pet.archived_at && isPetOwner
  // Moving a Pet out of a Family is a source-Family governance action. The
  // target Family owner still has to accept, so a Family owner can initiate
  // the handoff even when another user owns the Pet globally.
  const canInitiateTransfer = !pet.archived_at && Object.values(pet.family_roles ?? {}).some((role) => role === 'owner')
  const canManageLifecycle = Boolean(
    isPetOwner || Object.values(pet.family_roles ?? {}).some((role) => role === 'owner'),
  )
  // Restoring a deleted/archived Pet changes the global asset and quota. Keep
  // that recovery operation with the global Pet owner; the Family owner still
  // retains archive/delete governance for the linked organization.
  const canRestoreLifecycle = isPetOwner
  const todayItems = (todayQuery.data?.pets ?? []).flatMap((group) => group.items)
  const tasksTodayPending = todayItems.filter(isCareOpen).length
  const timezone = resolvePetTimezone(pet.family_ids, families.data?.families ?? [], preferredFamilyId)
  const timezoneAmbiguous = (pet.family_ids?.length ?? 0) > 1 && !timezone
  const timezoneUnavailable = Boolean(pet.family_ids?.length) && !timezone
  const careFamilyId = todayFamilyId

  async function archive() {
    if (!canManageLifecycle) return
    if (pet.archived_at) await planetApi.pets.unarchive(pet.id)
    else await planetApi.pets.archive(pet.id)
    invalidateAfterPetChange(client, pet.id)
    const refreshed = await petQuery.refetch()
    setConfirm(null)
    showToast({
      message: refreshed.error
        ? `${pet.archived_at ? '已恢复为活跃' : '已归档'}，但宠物页面刷新失败，请重试加载。`
        : pet.archived_at ? '已恢复为活跃。' : '已归档，历史保留。',
    })
  }

  async function destroy() {
    if (!canManageLifecycle) return
    await planetApi.pets.delete(pet.id)
    invalidateAfterPetChange(client, pet.id)
    showToast({ message: `已删除 ${pet.name}；宠物所有者可在宠物列表恢复` })
    router.replace('/pets' as never)
  }

  function goTab(next: PetWorkspaceTab) {
    const familyQuery = todayFamilyId ? `?familyId=${encodeURIComponent(todayFamilyId)}` : ''
    router.replace(`${next === 'overview' ? `/pets/${pet.id}` : `/pets/${pet.id}/care`}${familyQuery}` as never)
  }

  return (
    <Screen>
      <BackHeader
        title="宠物"
        fallbackHref="/pets"
        action={!writesLocked && canManagePetRecord ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="编辑档案"
            onPress={() => router.push(`/pets/${pet.id}/edit${todayFamilyId ? `?familyId=${encodeURIComponent(todayFamilyId)}` : ''}` as never)}
            style={[styles.gear, { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.md }]}
          >
            <GearSix size={20} color={theme.colors.forest2} />
          </PressableScale>
        ) : undefined}
      />

      {scopeDependencyError ? (
        <QueryErrorState
          message="家庭范围暂时无法更新，涉及日期的新增和修改已暂停。"
          onRetry={() => {
            void families.refetch()
            void preferences.refetch()
          }}
        />
      ) : null}
      {todayQuery.error ? (
        <QueryErrorState
          message="今天的照护清单暂时无法更新。"
          onRetry={() => void todayQuery.refetch()}
        />
      ) : null}

      {(pet.family_ids?.length ?? 0) > 1 ? (
        <Card style={[styles.familyContextCard, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}>
          <View style={{ gap: 3 }}>
            <AppText variant="label" color={theme.colors.forest2}>
              {todayFamilySelectionRequired ? '先选择照护家庭' : '当前照护家庭'}
            </AppText>
            <AppText variant="caption" muted>
              同一只宠物在不同家庭可以有不同的计划、负责人和日期。
            </AppText>
          </View>
          {families.isLoading ? (
            <LoadingState label="正在读取关联家庭" />
          ) : linkedFamiliesForScope.length > 0 ? (
            <ChoiceChips
              label="家庭"
              options={linkedFamiliesForScope.map((family) => ({ value: family.id, label: family.name }))}
              value={todayFamilyId ?? ''}
              onChange={(nextFamilyId) => {
                void hapticSelection()
                setScope({ type: 'pet', id: pet.id, familyId: nextFamilyId })
              }}
            />
          ) : null}
        </Card>
      ) : null}

      <FadeInView index={0}>
      <PetWorkspaceHero
        pet={pet}
        familyName={todayFamilyName}
        pendingCount={tasksTodayPending}
        readOnly={readOnly}
        familySelectionRequired={todayFamilySelectionRequired}
        canManagePlans={canManagePlans}
        canManageShares={canManagePet}
        writesLocked={writesLocked}
        onToday={() => {
          setScope({ type: 'pet', id: pet.id, ...(todayFamilyId ? { familyId: todayFamilyId } : {}) })
          router.push(`/(tabs)?pet_id=${encodeURIComponent(pet.id)}${todayFamilyId ? `&family_id=${encodeURIComponent(todayFamilyId)}` : ''}` as never)
        }}
        onCare={() => goTab('care')}
        onRecord={() => {
          setScope({ type: 'pet', id: pet.id, ...(todayFamilyId ? { familyId: todayFamilyId } : {}) })
          router.push(`/pets/${pet.id}/timeline?compose=note${todayFamilyId ? `&familyId=${encodeURIComponent(todayFamilyId)}` : ''}` as never)
        }}
        onPrepareVet={() => setVetSummarySignal((value) => value + 1)}
      />
      </FadeInView>

      <FadeInView index={1}>
      <View
        style={[
          styles.tabs,
          {
            backgroundColor: theme.colors.sageSoft,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {(
          [
            ['overview', '概览'],
            ['care', '照护'],
          ] as const
        ).map(([key, label]) => {
          const selected = tab === key
          return (
            <PressableScale
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                void hapticSelection()
                goTab(key)
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: selected ? theme.colors.paperStrong : 'transparent',
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <AppText
                variant="caption"
                color={selected ? theme.colors.ink : theme.colors.muted}
                style={{ fontWeight: '800' }}
              >
                {label}
              </AppText>
            </PressableScale>
          )
        })}
      </View>
      </FadeInView>

      {pet.archived_at ? (
        <FadeInView index={3}>
        <Card style={styles.notice}>
          <WarningCircle size={20} color={theme.colors.coral} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">这只宠物现在是只读状态。</AppText>
            <AppText muted>恢复活跃后才能新增照护计划、用药或时间线记录。</AppText>
          </View>
        </Card>
        </FadeInView>
      ) : null}

      <FadeInView index={4}>
      {tab === 'overview' ? (
        <OverviewTab
          pet={pet}
          profile={profile}
          families={families.data?.families ?? []}
          onArchive={() => setConfirm('archive')}
          onDelete={() => setConfirm('delete')}
          onFamilyChanged={async () => {
            const refreshed = await petQuery.refetch()
            if (refreshed.error) throw refreshed.error
            invalidateAfterPetChange(client, pet.id)
          }}
          onRecordWeight={() => {
            setScope({ type: 'pet', id: pet.id, ...(todayFamilyId ? { familyId: todayFamilyId } : {}) })
            router.push(`/pets/${pet.id}/timeline?compose=weight${todayFamilyId ? `&familyId=${encodeURIComponent(todayFamilyId)}` : ''}` as never)
          }}
          onOpenRecords={() => router.push(`/pets/${pet.id}/timeline${todayFamilyId ? `?familyId=${encodeURIComponent(todayFamilyId)}` : ''}` as never)}
          recentEvents={recentTimeline.data?.events ?? []}
          recentEventsLoading={recentTimeline.isLoading}
          recentEventsError={recentTimeline.error}
          recentEventsTimezone={timezone}
          onRetryRecentEvents={() => void recentTimeline.refetch()}
          familyId={todayFamilyId}
          showExport={caps.export_json && isPetOwner}
          writesLocked={writesLocked}
          canManagePet={canManagePet}
          canManagePetRecord={canManagePetRecord}
          canInitiateTransfer={canInitiateTransfer}
          transferFamilyId={todayFamilyId}
          canManageLifecycle={canManageLifecycle}
          canRestoreLifecycle={canRestoreLifecycle}
          openSummarySignal={vetSummarySignal}
        />
      ) : null}
      {tab === 'care' ? (
        <View style={{ gap: 28 }}>
          <CareSection
            pet={pet}
            timezone={timezone}
            timezoneAmbiguous={timezoneAmbiguous || Boolean(scopeDependencyError)}
            timezoneUnavailable={timezoneUnavailable}
            familyId={careFamilyId}
            readOnly={writesLocked}
            canManagePlans={canManagePlans}
          />
          <MedicationsSection
            pet={pet}
            timezone={timezone}
            familyId={careFamilyId}
            timezoneAmbiguous={timezoneAmbiguous || Boolean(scopeDependencyError)}
            timezoneUnavailable={timezoneUnavailable}
            readOnly={writesLocked}
            canManageRecords={canManagePetRecord}
          />
        </View>
      ) : null}
      </FadeInView>

      <ConfirmDialog
        visible={confirm === 'archive'}
        title={pet.archived_at ? `恢复 ${pet.name}？` : `归档 ${pet.name}？`}
        consequence={
          pet.archived_at
            ? '档案和写入操作会重新变为活跃。'
            : '档案变为只读，历史全部保留，只是不能再添加新的照护执行。'
        }
        confirmLabel={pet.archived_at ? '恢复活跃' : '归档'}
        onCancel={() => setConfirm(null)}
        onConfirm={archive}
      />
      <ConfirmDialog
        visible={confirm === 'delete'}
        title={`删除 ${pet.name} 的档案？`}
        consequence="这会让宠物从所有关联家庭的活跃视图消失并停止后续照护；历史在保护期内保留，只有宠物所有者可以恢复。"
        confirmLabel="删除宠物档案"
        requireText={pet.name}
        onCancel={() => setConfirm(null)}
        onConfirm={destroy}
      />
    </Screen>
  )
}

function OverviewTab({
  pet,
  profile,
  families,
  onArchive,
  onDelete,
  onRecordWeight,
  onOpenRecords,
  familyId,
  recentEvents,
  recentEventsLoading,
  recentEventsError,
  recentEventsTimezone,
  onRetryRecentEvents,
  onFamilyChanged,
  showExport,
  writesLocked,
  canManagePet,
  canManagePetRecord,
  canInitiateTransfer,
  transferFamilyId,
  canManageLifecycle,
  canRestoreLifecycle,
  openSummarySignal,
}: {
  pet: Pet
  profile: Profile
  families: Family[]
  onArchive: () => void
  onDelete: () => void
  onRecordWeight: () => void
  onOpenRecords: () => void
  familyId?: string
  recentEvents: Array<import('../../core/api/planet-api').TimelineEvent>
  recentEventsLoading: boolean
  recentEventsError: unknown
  recentEventsTimezone?: string
  onRetryRecentEvents: () => void
  onFamilyChanged: () => Promise<void>
  showExport: boolean
  writesLocked: boolean
  canManagePet: boolean
  canManagePetRecord: boolean
  canInitiateTransfer: boolean
  transferFamilyId?: string
  canManageLifecycle: boolean
  canRestoreLifecycle: boolean
  openSummarySignal: number
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 12 }}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitle}>
            <Info size={18} color={theme.colors.forest2} />
            <AppText variant="heading">基本信息</AppText>
          </View>
        </View>
        <InfoRow label="物种" value={speciesLabel(pet.species)} />
        <InfoRow label="性别" value={sexLabel(pet.sex)} />
        <InfoRow label="生日" value={pet.birth_date ? civilDateLabel(pet.birth_date) : '未设置'} />
        <InfoRow label="绝育" value={pet.neutered ? '已绝育' : '未绝育'} />
        <InfoRow
          label="体重"
          value={weightKg(pet.weight_g) || '去记一次体重'}
          onPress={writesLocked ? undefined : onRecordWeight}
        />
      </Card>

      <Card style={{ gap: 12 }}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitle}>
            <ClipboardText size={18} color={theme.colors.forest2} />
            <AppText variant="heading">健康档案</AppText>
          </View>
        </View>
          <ProfileSummary
          profile={profile}
          onEdit={() => router.push(`/pets/${pet.id}/edit${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}` as never)}
          readOnly={writesLocked || !canManagePetRecord}
        />
      </Card>

      <RecentActivityCard
        petName={pet.name}
        events={recentEvents}
        loading={recentEventsLoading}
        error={recentEventsError}
        timezone={recentEventsTimezone}
        onRetry={onRetryRecentEvents}
        onOpenRecords={onOpenRecords}
      />

      <MoreGroup label="记录和分享">
        <MoreRow
          icon={<Clock size={19} color={theme.colors.forest2} />}
          title="记录"
          sub="照护、体重、就诊等记录"
          href={`/pets/${pet.id}/timeline${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}`}
        />
        {showExport ? (
        <MoreRow
          icon={<DownloadSimple size={19} color={theme.colors.forest2} />}
            title="导出数据"
            sub="保存这只宠物的完整记录"
            onPress={() => {
              void (async () => {
                try {
                  const data = await extensionReaders.petExport(pet.id)
                  const content = JSON.stringify(data, null, 2)
                  const filename = `${pet.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 48) || 'pet'}-planet-export.json`
                  if (Platform.OS === 'web') {
                    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const anchor = document.createElement('a')
                    anchor.href = url
                    anchor.download = filename
                    anchor.click()
                    URL.revokeObjectURL(url)
                    showToast({ message: 'JSON 数据已下载' })
                    return
                  }
                  const file = new File(Paths.cache, filename)
                  file.create({ overwrite: true })
                  file.write(content)
                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(file.uri, {
                      mimeType: 'application/json',
                      dialogTitle: `导出 ${pet.name} 的 JSON 数据`,
                      UTI: 'public.json',
                    })
                    return
                  }
                  await Clipboard.setStringAsync(content)
                  showToast({ message: '系统分享不可用，JSON 数据已复制' })
                } catch (e) {
                  showToast({ message: errorMessage(e) })
                }
            })()
          }}
        />
        ) : null}
        {canInitiateTransfer ? (
          <MoreRow
            icon={<Users size={19} color={theme.colors.forest2} />}
            title="转移到其他家庭"
            sub="把宠物移出当前家庭；需目标家庭管理员接受"
            href={`/pets/${pet.id}/transfer${transferFamilyId ? `?familyId=${encodeURIComponent(transferFamilyId)}` : ''}`}
          />
        ) : null}
      </MoreGroup>

      <FamilyLinksSection
        pet={pet}
        families={families}
        canManagePet={canManagePet}
        onChanged={onFamilyChanged}
      />

      <View style={{ gap: 10 }}>
        <View style={styles.cardTitle}>
          <ShareNetwork size={18} color={theme.colors.forest2} />
          <AppText variant="heading">分享给别人</AppText>
        </View>
        <SharingSection
          pet={pet}
          readOnly={!canManagePet}
          openSummarySignal={openSummarySignal}
        />
      </View>

      {canManageLifecycle ? (
        <View style={styles.danger}>
          {(!pet.archived_at || canRestoreLifecycle) ? (
            <Button
              label={pet.archived_at ? '恢复为活跃' : '归档宠物'}
              variant="secondary"
              onPress={onArchive}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="删除宠物档案"
            onPress={onDelete}
            style={styles.dangerLink}
          >
            <Trash size={16} color={theme.colors.danger} />
            <AppText color={theme.colors.danger}>删除档案</AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

function PetWorkspaceHero({
  pet,
  familyName,
  pendingCount,
  readOnly,
  familySelectionRequired,
  canManagePlans,
  canManageShares,
  writesLocked,
  onToday,
  onCare,
  onRecord,
  onPrepareVet,
}: {
  pet: Pet
  familyName?: string
  pendingCount: number
  readOnly: boolean
  familySelectionRequired: boolean
  canManagePlans: boolean
  canManageShares: boolean
  writesLocked: boolean
  onToday: () => void
  onCare: () => void
  onRecord: () => void
  onPrepareVet: () => void
}) {
  const { theme } = useTheme()
  const { width } = useWindowDimensions()
  const compact = width < 520
  const familyLabel = familyName ?? (familySelectionRequired ? '请选择照护家庭' : '未关联家庭')
  const metadata = [pet.breed || speciesLabel(pet.species), ageText(pet.birth_date ?? undefined)]
    .filter(Boolean)
    .join(' · ')
  return (
    <View
      accessibilityLabel={`${pet.name} 宠物工作区`}
      style={[styles.workspaceHero, { backgroundColor: theme.colors.forest2, borderRadius: theme.radius.xl }]}
    >
      <View style={styles.workspaceHeroTop}>
        <View style={[styles.workspaceAvatar, { backgroundColor: theme.colors.mint }]}>
          <PetAvatar petId={pet.id} species={pet.species} size={84} decorative />
        </View>
        <View style={styles.workspaceIdentity}>
          <AppText variant="eyebrow" color={theme.colors.mint}>宠物</AppText>
          <AppText variant="title" color={theme.colors.onBrand} numberOfLines={1}>{pet.name}</AppText>
          <AppText variant="caption" color={theme.colors.onBrandMuted} numberOfLines={1}>
            {metadata || speciesLabel(pet.species)}
          </AppText>
          <View style={styles.workspaceFamilyLine}>
            <House size={14} color={theme.colors.mint} weight="bold" />
            <AppText variant="caption" color={theme.colors.mint} numberOfLines={1}>{familyLabel}</AppText>
          </View>
          {readOnly ? <AppText variant="caption" color={theme.colors.onBrandMuted}>只查看成员</AppText> : null}
        </View>
        <View style={[styles.workspaceStatus, compact && styles.workspaceStatusCompact]}>
          <View style={[styles.workspaceStatusCopy, compact && styles.workspaceStatusCopyCompact]}>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>今天</AppText>
            <AppText variant="display" color={pendingCount > 0 ? theme.colors.onBrand : theme.colors.mint}>{pendingCount}</AppText>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>{pendingCount > 0 ? '项待处理' : '已处理完'}</AppText>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ disabled: familySelectionRequired }}
            disabled={familySelectionRequired}
            onPress={onToday}
            style={[styles.workspacePrimary, compact && styles.workspacePrimaryCompact, { backgroundColor: theme.colors.mint }]}
          >
            <Clock size={16} color={theme.colors.forest2} weight="bold" />
            <AppText variant="label" color={theme.colors.forest2}>处理今天</AppText>
          </PressableScale>
        </View>
      </View>
      <View style={[styles.workspaceHeroBottom, { borderTopColor: theme.colors.onBrandSoft }]}>
        <PressableScale accessibilityRole="button" onPress={onCare} style={styles.workspaceLink}>
          <GearSix size={17} color={theme.colors.mint} weight="bold" />
          <View style={styles.workspaceLinkCopy}>
            <AppText variant="label" color={theme.colors.onBrand}>照护计划</AppText>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>{canManagePlans ? '调整周期安排' : '查看当前安排'}</AppText>
          </View>
          <CaretRight size={15} color={theme.colors.onBrandMuted} weight="bold" />
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ disabled: writesLocked }}
          disabled={writesLocked}
          onPress={onRecord}
          style={[styles.workspaceLink, writesLocked ? styles.workspaceLinkDisabled : null]}
        >
          <ClipboardText size={17} color={theme.colors.mint} weight="bold" />
          <View style={styles.workspaceLinkCopy}>
            <AppText variant="label" color={theme.colors.onBrand}>记一条</AppText>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>{writesLocked ? '只查看记录' : '记录刚发生的事'}</AppText>
          </View>
          <CaretRight size={15} color={theme.colors.onBrandMuted} weight="bold" />
        </PressableScale>
        {canManageShares ? (
          <PressableScale accessibilityRole="button" onPress={onPrepareVet} style={styles.workspaceLink}>
            <Stethoscope size={17} color={theme.colors.mint} weight="bold" />
            <View style={styles.workspaceLinkCopy}>
              <AppText variant="label" color={theme.colors.onBrand}>准备就诊</AppText>
              <AppText variant="caption" color={theme.colors.onBrandMuted}>生成健康摘要 PDF</AppText>
            </View>
            <CaretRight size={15} color={theme.colors.onBrandMuted} weight="bold" />
          </PressableScale>
        ) : null}
      </View>
    </View>
  )
}

function RecentActivityCard({
  petName,
  events,
  loading,
  error,
  timezone,
  onRetry,
  onOpenRecords,
}: {
  petName: string
  events: Array<import('../../core/api/planet-api').TimelineEvent>
  loading: boolean
  error: unknown
  timezone?: string
  onRetry: () => void
  onOpenRecords: () => void
}) {
  const { theme } = useTheme()
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <Clock size={18} color={theme.colors.forest2} />
          <AppText variant="heading">最近发生</AppText>
        </View>
        <Button label="全部记录" variant="ghost" onPress={onOpenRecords} />
      </View>
      {loading ? <AppText muted>正在读取最近记录…</AppText> : null}
      {error ? (
        <QueryErrorState
          embedded
          message="最近记录暂时无法更新"
          onRetry={onRetry}
        />
      ) : null}
      {!loading && !error && events.length === 0 ? (
        <View style={{ gap: 8 }}>
          <AppText muted>{petName} 还没有记录。</AppText>
          <AppText variant="caption" muted>完成照护、记体重或写一笔后，会显示在这里。</AppText>
        </View>
      ) : null}
      {!loading && !error ? events.map((event) => {
        const description = describeEvent(event.type, event.payload)
        return (
          <PressableScale
            key={event.id}
            accessibilityRole="button"
            accessibilityLabel={`${description.category}${description.headline ? `：${description.headline}` : ''}，打开全部记录`}
            onPress={onOpenRecords}
            style={[styles.recentRow, { borderTopColor: theme.colors.line }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label" numberOfLines={1}>
                {[description.category, description.headline].filter(Boolean).join(' · ')}
              </AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {event.recorded_by_name ? `记录人 · ${event.recorded_by_name}` : '照护记录'}
              </AppText>
            </View>
            <AppText variant="caption" muted>
              {formatClockInTimeZoneSafe(event.occurred_at, timezone)}
            </AppText>
            <CaretRight size={16} color={theme.colors.soft} weight="bold" />
          </PressableScale>
        )
      }) : null}
    </Card>
  )
}

function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress?: () => void
}) {
  const body = (
    <>
      <AppText variant="caption" muted style={{ width: 56 }}>
        {label}
      </AppText>
      <AppText variant="label" style={{ flex: 1 }}>
        {value}
      </AppText>
    </>
  )
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.infoRow} accessibilityRole="button" accessibilityLabel={`${label}：${value}`}>
        {body}
      </Pressable>
    )
  }
  return <View style={styles.infoRow}>{body}</View>
}

function FamilyLinksSection({
  pet,
  families,
  canManagePet,
  onChanged,
}: {
  pet: Pet
  families: Family[]
  canManagePet: boolean
  onChanged: () => Promise<void>
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [selectedFamilyId, setSelectedFamilyId] = useState('')
  const [familyToRemove, setFamilyToRemove] = useState<Family | null>(null)
  const [busy, setBusy] = useState(false)
  const linkedIds = new Set(pet.family_ids ?? [])
  const linkedFamilies = families.filter((family) => linkedIds.has(family.id))
  const availableFamilies = families.filter((family) => !linkedIds.has(family.id))
  const selectedFamily = availableFamilies.find((family) => family.id === selectedFamilyId)
  const familyDetails = useQueries({
    queries: linkedFamilies.map((family) => ({
      queryKey: queryKeys.family(family.id),
      queryFn: () => planetApi.families.detail(family.id),
      enabled: Boolean(family.id),
    })),
  })

  function openAdd() {
    setSelectedFamilyId(availableFamilies[0]?.id ?? '')
    setAddOpen(true)
  }

  async function addFamily() {
    if (!selectedFamily) return
    setBusy(true)
    try {
      await planetApi.pets.shareFamily(pet.id, selectedFamily.id)
      await onChanged()
      setAddOpen(false)
      showToast({ message: `已把 ${pet.name} 加到「${selectedFamily.name}」` })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  async function removeFamily() {
    if (!familyToRemove || linkedFamilies.length <= 1) return
    setBusy(true)
    try {
      await planetApi.pets.unshareFamily(pet.id, familyToRemove.id)
      await onChanged()
      showToast({ message: `已从「${familyToRemove.name}」移出` })
      setFamilyToRemove(null)
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <MoreGroup label={`家庭 · ${linkedFamilies.length}`}>
        {linkedFamilies.map((family) => (
          <View key={family.id} style={styles.familyRow}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`打开家庭 ${family.name}`}
              onPress={() => router.push(`/families/${family.id}` as never)}
              style={styles.familyRowMain}
            >
              <View style={[styles.familyIcon, { backgroundColor: theme.colors.sageSoft }]}>
                <House size={18} color={theme.colors.forest2} weight="duotone" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={1}>{family.name}</AppText>
                <AppText variant="caption" muted>
                  {[family.member_count ? `${family.member_count} 位成员` : '', family.role ? `你是${family.role === 'owner' ? '家庭管理员' : family.role === 'viewer' ? '只查看成员' : '照护成员'}` : '你可以查看']
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
              </View>
              <CaretRight size={16} color={theme.colors.soft} weight="bold" />
            </PressableScale>
            {canManagePet && linkedFamilies.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`从${family.name}移出${pet.name}`}
                onPress={() => setFamilyToRemove(family)}
                style={styles.familyRemove}
              >
                <AppText variant="caption" color={theme.colors.coralDark}>移出</AppText>
              </Pressable>
            ) : null}
          </View>
        ))}
        {linkedFamilies.map((family, index) => {
          const detail = familyDetails[index]?.data
          const members = detail?.members ?? []
          return (
            <View key={`${family.id}-members`} style={[styles.familyMembers, { borderTopColor: theme.colors.line }]}>
              <View style={styles.familyMembersHead}>
                <View style={styles.cardTitle}>
                  <Users size={16} color={theme.colors.forest2} />
                  <AppText variant="caption" color={theme.colors.forest2} style={{ fontWeight: '800' }}>
                    {family.name} · 照护成员
                  </AppText>
                </View>
                {detail ? (
                  <AppText variant="caption" muted>{members.length} 人</AppText>
                ) : null}
              </View>
              {members.length > 0 ? (
                <View style={styles.memberPills}>
                  {members.map((member) => {
                    const canParticipate = member.role !== 'viewer' && member.role !== 'read_only'
                    return (
                      <View key={member.user_id} style={[styles.memberPill, { backgroundColor: canParticipate ? theme.colors.sageSoft : theme.colors.canvas }]}>
                        <AppText variant="caption" color={canParticipate ? theme.colors.forest2 : theme.colors.muted} numberOfLines={1}>
                          {member.display_name} · {canParticipate ? '可参与' : '只查看'}
                        </AppText>
                      </View>
                    )
                  })}
                </View>
              ) : familyDetails[index]?.isLoading ? (
                <AppText variant="caption" muted>正在读取成员…</AppText>
              ) : familyDetails[index]?.error ? (
                <AppText accessibilityRole="alert" variant="caption" muted>成员信息暂时无法读取，打开家庭查看。</AppText>
              ) : null}
            </View>
          )
        })}
        {linkedFamilies.length === 0 ? (
          <AppText muted>目前没有家庭关联，先加入一个家庭才能安排照护。</AppText>
        ) : null}
        {canManagePet && availableFamilies.length > 0 ? (
          <MoreRow
            icon={<House size={19} color={theme.colors.forest2} weight="duotone" />}
            title="添加到其他家庭"
            sub="保留当前家庭，再让另一个家庭一起查看和照护"
            onPress={openAdd}
          />
        ) : null}
        {canManagePet && availableFamilies.length === 0 && linkedFamilies.length > 0 ? (
          <AppText variant="caption" muted>你加入的家庭都已关联这只宠物。</AppText>
        ) : null}
      </MoreGroup>

      <ModalSheet visible={addOpen} onClose={() => setAddOpen(false)} busy={busy}>
        <AppText variant="eyebrow" soft>家庭关联</AppText>
        <AppText variant="heading">把 {pet.name} 加到另一个家庭</AppText>
        <AppText muted>这不会删除当前家庭的记录，只会增加一个可见和照护的家庭范围。</AppText>
        <ChoiceChips
          label="选择家庭"
          options={availableFamilies.map((family) => ({ value: family.id, label: family.name }))}
          value={selectedFamilyId}
          onChange={setSelectedFamilyId}
        />
        <View style={styles.dialogActions}>
          <Button label="取消" variant="secondary" onPress={() => setAddOpen(false)} style={{ flex: 1 }} />
          <Button label="添加家庭" busy={busy} disabled={!selectedFamily} onPress={() => void addFamily()} style={{ flex: 1 }} />
        </View>
      </ModalSheet>

      <ConfirmDialog
        visible={Boolean(familyToRemove)}
        title={`从「${familyToRemove?.name ?? ''}」移出 ${pet.name}？`}
        consequence="只会移除这个家庭的可见和照护关系；宠物档案、历史记录和其他家庭不受影响。"
        confirmLabel="移出家庭"
        onCancel={() => setFamilyToRemove(null)}
        onConfirm={() => void removeFamily()}
      />
    </>
  )
}

function ProfileSummary({
  profile,
  onEdit,
  readOnly,
}: {
  profile: Profile
  onEdit: () => void
  readOnly: boolean
}) {
  const allergies = profileLines(profile.allergies, 'name')
  const conditions = profileLines(profile.conditions, 'name')
  const contacts = profileContactRows(profile.emergency_contacts)
    .filter((row) => row.name || row.phone)
    .map((row) => [row.name, row.phone].filter(Boolean).join(' '))
    .join('、')
  const decision = profileObjectName(profile.med_decision_maker)
  const extra = [
    allergies ? `过敏：${allergies.replaceAll('\n', '、')}` : '',
    conditions ? `疾病：${conditions.replaceAll('\n', '、')}` : '',
    contacts ? `紧急联系人：${contacts}` : '',
    decision ? `用药决策人：${decision}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  if (!extra && !profile.notes) {
    return (
      <View style={{ gap: 8 }}>
        <AppText muted>还没有备注。写一点能帮大家把它照顾得更好。</AppText>
        {!readOnly ? <Button label="去编辑档案" variant="ghost" onPress={onEdit} /> : null}
      </View>
    )
  }
  return (
    <View style={{ gap: 8 }}>
      <AppText>{[extra, profile.notes].filter(Boolean).join('\n')}</AppText>
      {!readOnly ? <Button label="编辑档案" variant="ghost" onPress={onEdit} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  workspaceHero: { gap: 0, overflow: 'hidden' },
  workspaceHeroTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    minHeight: 174,
  },
  workspaceAvatar: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  workspaceIdentity: { flex: 1, minWidth: 0, gap: 3 },
  workspaceFamilyLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  workspaceStatus: { alignItems: 'flex-end', gap: 1, minWidth: 132 },
  workspaceStatusCompact: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  workspaceStatusCopy: { alignItems: 'flex-end', gap: 1 },
  workspaceStatusCopyCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  workspacePrimary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 11,
    marginTop: 8,
  },
  workspacePrimaryCompact: { marginTop: 0 },
  workspaceHeroBottom: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  workspaceLink: {
    flex: 1,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  workspaceLinkDisabled: { opacity: 0.58 },
  workspaceLinkCopy: { flex: 1, minWidth: 0, gap: 1 },
  familyContextCard: {
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusLine: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabs: { flexDirection: 'row', padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  progressPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  notice: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  familyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  familyRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  familyIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  familyRemove: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  familyMembers: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingBottom: 4 },
  familyMembersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  memberPill: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  danger: { gap: 12, paddingBottom: 24 },
  dangerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', padding: 8 },
  recentRow: {
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
