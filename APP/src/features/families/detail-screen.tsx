import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowsLeftRight,
  Bell,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  Clock,
  House,
  PawPrint,
  PencilSimple,
  Trash,
  UserMinus,
  Users,
  WarningCircle,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import {
  createIdempotencyKey,
  planetApi,
  type Family,
  type FamilyAuditRecord,
  type Member,
  type Pet,
  type Today,
  type TodayItem,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { ageText, roleLabel, speciesLabel, timezoneCity } from '../../core/display'
import { foundationReaders, invalidateAfterFamilyChange } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { LoadingState } from '../../ui/components/loading-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { MoreGroup, MoreRow } from '../../ui/components/more'
import { PetAvatar } from '../../ui/components/pet-avatar'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { FadeInView, hapticSelection, PressableScale } from '../../ui/motion'
import { TextField } from '../../ui/components/text-field'
import { useScope } from '../../core/scope/scope-provider'
import { InviteSheet } from './invite-sheet'
import { TimezoneField } from './timezone-picker'
import { CareResponsibilityBanner } from '../collaboration/care-responsibility-banner'
import { isCareOpen } from '../../core/presentation/care-status'

export function FamilyDetailScreen({
  familyId,
  openInvite = false,
}: {
  familyId: string
  openInvite?: boolean
}) {
  const { theme } = useTheme()
  const { width: viewportWidth } = useWindowDimensions()
  const { showToast } = useToast()
  const { setScope } = useScope()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () => planetApi.families.detail(familyId),
    enabled: Boolean(familyId),
  })
  const pets = useQuery({
    queryKey: ['family-pets', familyId],
    queryFn: () => planetApi.families.pets(familyId),
    enabled: Boolean(familyId),
  })
  const today = useQuery({
    queryKey: queryKeys.today({ familyId }),
    queryFn: () => foundationReaders.today({ family_id: familyId }),
    enabled: Boolean(familyId),
  })
  const incomingTransfers = useQuery({
    queryKey: queryKeys.transfers(familyId, 'incoming'),
    queryFn: () => planetApi.transfers.list(familyId, 'incoming'),
    enabled: Boolean(familyId && query.data?.family.role === 'owner'),
  })
  const audit = useQuery({
    queryKey: queryKeys.familyAudit(familyId),
    queryFn: () => planetApi.families.auditRecords(familyId),
    enabled: Boolean(familyId && query.data),
  })
  useEffect(() => {
    if (familyId) setScope({ type: 'family', id: familyId })
  }, [familyId, setScope])
  const [edit, setEdit] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(openInvite)
  const [confirm, setConfirm] = useState<'delete' | 'leave' | Member | null>(null)
  const [petToRemove, setPetToRemove] = useState<Pet | null>(null)
  const [roleBusy, setRoleBusy] = useState('')
  const wideLayout = Platform.OS === 'web' && viewportWidth >= 960

  if (query.isLoading || pets.isLoading) {
    return (
      <Screen>
        <BackHeader title="家庭" fallbackHref="/families" />
        <LoadingState label="正在加载家庭工作区" />
      </Screen>
    )
  }
  if (query.error || pets.error || !query.data) {
    return (
      <Screen>
        <BackHeader title="家庭" fallbackHref="/families" />
        <QueryErrorState
          error={query.error ?? pets.error}
          message={query.error ? undefined : pets.error ? undefined : '这个家庭不存在或对你不可见'}
          onRetry={() => {
            void query.refetch()
            void pets.refetch()
          }}
        />
      </Screen>
    )
  }

  const { family, members } = query.data
  const petRows = pets.data?.pets ?? []
  const isOwner = family.role === 'owner'
  const canDelete = isOwner && members.length === 1 && petRows.length === 0
  const pendingIncomingTransfers = (incomingTransfers.data?.transfers ?? []).filter(
    (transfer) => transfer.status === 'pending',
  )
  const todayByPet = new Map(
    (today.data?.pets ?? []).map((group) => {
      const pending = group.items.filter(isCareOpen).length
      return [group.pet_id, {
        pending,
        next: group.items.find(isCareOpen),
      }]
    }),
  )
  const todayItems = (today.data?.pets ?? []).flatMap((group) => group.items)
  const todayPending = todayItems.filter(isCareOpen).length
  const todayCompleted = todayItems.filter((item) => item.log?.status === 'done' || item.log?.status === 'completed').length

  function openPet(petId: string) {
    // Keep the family edge that led to this pet. A shared pet can belong to
    // several families, and its care dates/assignments must stay in context.
    setScope({ type: 'pet', id: petId, familyId: family.id })
    router.push(`/pets/${petId}?familyId=${encodeURIComponent(family.id)}` as never)
  }

  function openFamilyTimeline() {
    setScope({ type: 'family', id: family.id })
    router.push(`/timeline?family_id=${encodeURIComponent(family.id)}` as never)
  }

  const createPetHref = `/pets/new?guided=1&family_id=${encodeURIComponent(family.id)}`

  async function destructive() {
    if (confirm === 'delete') {
      await planetApi.families.delete(family.id, family.name)
      invalidateAfterFamilyChange(client)
      showToast({ message: `已删除「${family.name}」；30 天内可在设置中恢复` })
      router.replace('/families' as never)
    } else if (confirm === 'leave') {
      await planetApi.families.leave(family.id)
      invalidateAfterFamilyChange(client)
      showToast({ message: `已退出「${family.name}」` })
      router.replace('/families' as never)
    } else if (confirm && typeof confirm === 'object') {
      await planetApi.families.removeMember(family.id, confirm.user_id)
      await query.refetch()
      invalidateAfterFamilyChange(client)
      showToast({ message: `已移除 ${confirm.display_name}` })
    }
    setConfirm(null)
  }

  async function removePetFromFamily() {
    if (!petToRemove) return
    try {
      await planetApi.pets.removeFromFamily(petToRemove.id, family.id)
      setPetToRemove(null)
      await pets.refetch()
      invalidateAfterFamilyChange(client)
      showToast({ message: `已从「${family.name}」移出 ${petToRemove.name}` })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    }
  }

  async function changeMemberRole(member: Member) {
    if (!isOwner || member.role === 'owner' || roleBusy) return
    const nextRole = member.role === 'viewer' ? 'caregiver' : 'viewer'
    setRoleBusy(member.user_id)
    try {
      await planetApi.families.updateMemberRole(family.id, member.user_id, nextRole)
      await query.refetch()
      invalidateAfterFamilyChange(client)
      showToast({ message: `${member.display_name} 已改为${nextRole === 'viewer' ? '只查看' : '可参与照护'}` })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setRoleBusy('')
    }
  }

  return (
    <Screen>
      <BackHeader
        title="家庭"
        fallbackHref="/families"
        action={
          isOwner ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="编辑家庭"
              onPress={() => setEdit(true)}
              style={styles.iconBtn}
            >
              <PencilSimple size={18} color={theme.colors.forest2} />
            </PressableScale>
          ) : undefined
        }
      />

      <FadeInView index={0}>
        <FamilyWorkspaceHero
          family={family}
          memberCount={members.length}
          petCount={petRows.length}
          pendingCount={todayPending}
          completedCount={todayCompleted}
          readOnly={family.role === 'viewer' || family.role === 'read_only'}
          onToday={() => {
            setScope({ type: 'family', id: family.id })
            router.push(`/(tabs)?family_id=${encodeURIComponent(family.id)}` as never)
          }}
          onAddPet={() => router.push(createPetHref as never)}
          onInvite={() => setInviteOpen(true)}
        />
      </FadeInView>

      <FadeInView index={1}>
        <FamilyTodayCard
          family={family}
          today={today.data}
          loading={today.isLoading}
          error={today.error}
          onRetry={() => void today.refetch()}
          onOpenToday={(taskId) => {
            setScope({ type: 'family', id: family.id })
            const focus = taskId ? `&focus_task_id=${encodeURIComponent(taskId)}` : ''
            // Go to the tab group directly. Pushing `/` from a stack page
            // enters app/index.tsx first, whose auth redirect drops query
            // parameters before Today can apply the family scope.
            router.push(`/(tabs)?family_id=${encodeURIComponent(family.id)}${focus}` as never)
          }}
        />
      </FadeInView>

      <View style={[styles.detailColumns, wideLayout ? styles.detailColumnsWide : null]}>
        <View style={[styles.detailColumn, wideLayout ? styles.detailColumnWide : null]}>
          {members.length > 1 ? (
            <CareResponsibilityBanner
              familyId={family.id}
              familyName={family.name}
              canParticipate={family.role !== 'viewer' && family.role !== 'read_only'}
            />
          ) : null}

          <FadeInView index={2}>
            <MoreGroup label={`成员 · ${members.length}`}>
              {members.map((member) => (
                <View key={member.user_id} style={styles.memberRow}>
                  <View style={[styles.avatar, { backgroundColor: theme.colors.sageSoft }]}>
                    <AppText variant="label" color={theme.colors.forest2}>
                      {member.display_name.slice(0, 1).toUpperCase()}
                    </AppText>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label">{member.display_name}</AppText>
                    {member.email ? (
                      <AppText variant="caption" muted numberOfLines={1}>
                        {member.email}
                      </AppText>
                    ) : null}
                  </View>
                  {member.role === 'owner' || !isOwner ? (
                    <AppText variant="caption" soft>
                      {member.role === 'owner' ? roleLabel(member.role) : member.role === 'viewer' ? '只查看' : '可参与'}
                    </AppText>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${member.display_name}权限：${member.role === 'viewer' ? '只查看' : '可参与照护'}，点击切换`}
                      disabled={roleBusy === member.user_id}
                      onPress={() => void changeMemberRole(member)}
                      style={[styles.roleButton, { backgroundColor: theme.colors.sageSoft, opacity: roleBusy === member.user_id ? 0.5 : 1 }]}
                    >
                      <AppText variant="caption" color={theme.colors.forest2}>
                        {member.role === 'viewer' ? '只查看' : '可参与'}
                      </AppText>
                    </Pressable>
                  )}
                  {isOwner && member.role !== 'owner' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`移除 ${member.display_name}`}
                      onPress={() => setConfirm(member)}
                      style={styles.iconBtn}
                    >
                      <UserMinus size={16} color={theme.colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {isOwner && members.length === 1 ? (
                <AppText muted style={{ paddingHorizontal: 10, paddingBottom: 12 }}>
                  {petRows.length === 0
                    ? '先添加宠物，再邀请成员分工照护。'
                    : '还只有你一个人。点上方「邀请成员」发邀请码。'}
                </AppText>
              ) : null}
            </MoreGroup>
          </FadeInView>

          <FadeInView index={3}>
            <MoreGroup label={`宠物 · ${petRows.length}`}>
              {petRows.map((pet) => (
                <FamilyPetRow
                  key={pet.id}
                  pet={pet}
                  todaySummary={todayByPet.get(pet.id)}
                  onOpen={() => openPet(pet.id)}
                  onRemove={isOwner ? () => setPetToRemove(pet) : undefined}
                />
              ))}
              {petRows.length === 0 && isOwner ? (
                <MoreRow
                  icon={<PawPrint size={19} color={theme.colors.forest2} weight="duotone" />}
                  title="这个家庭还没有宠物"
                  sub="添加后，就能给它安排照护"
                  href={createPetHref}
                />
              ) : null}
            </MoreGroup>
          </FadeInView>

          <FadeInView index={4}>
            <MoreGroup label="记录">
              <MoreRow
                icon={<ClockCounterClockwise size={19} color={theme.colors.forest2} weight="duotone" />}
                title="家庭记录"
                sub="查看这个家庭里所有宠物发生过的事"
                onPress={openFamilyTimeline}
              />
            </MoreGroup>
          </FadeInView>

          <FadeInView index={5}>
            <FamilyAuditCard
              records={audit.data?.records ?? []}
              timezone={family.timezone}
              loading={audit.isLoading}
              error={audit.error}
              onRetry={() => void audit.refetch()}
            />
          </FadeInView>
        </View>

        <View style={[styles.detailColumn, wideLayout ? styles.detailColumnWide : null]}>
          {isOwner && incomingTransfers.error ? (
            <FadeInView index={6}>
              <IncomingTransferErrorCard onRetry={() => void incomingTransfers.refetch()} />
            </FadeInView>
          ) : isOwner && pendingIncomingTransfers.length > 0 ? (
            <FadeInView index={6}>
              <IncomingTransferCard
                count={pendingIncomingTransfers.length}
                onOpen={() => router.push(`/families/${family.id}/transfers` as never)}
              />
            </FadeInView>
          ) : null}

          {isOwner ? (
            <FadeInView index={7}>
              <FamilyGovernanceCard
                memberCount={members.length}
                petCount={petRows.length}
                canDelete={canDelete}
              />
            </FadeInView>
          ) : null}

          <FadeInView index={8}>
            <MoreGroup label="管理">
              <MoreRow
                icon={<Bell size={19} color={theme.colors.forest2} weight="duotone" />}
                title="通知设置"
                sub="为这个家庭设置日常提醒、摘要和预警"
                href={`/settings/notifications?familyId=${encodeURIComponent(family.id)}`}
              />
              {isOwner && members.length > 1 ? (
                <MoreRow
                  icon={<Users size={19} color={theme.colors.forest2} weight="duotone" />}
                  title="转让管理员"
                  sub="选择一位成员接任，你会变成照护者"
                  onPress={() => setTransferOpen(true)}
                />
              ) : null}
              {isOwner ? (
                <MoreRow
                  icon={<ArrowsLeftRight size={19} color={theme.colors.forest2} />}
                  title="宠物转移请求"
                  sub={pendingIncomingTransfers.length > 0
                    ? `${pendingIncomingTransfers.length} 条待处理`
                    : '查看收到的和发出的转移记录'}
                  href={`/families/${family.id}/transfers`}
                />
              ) : null}
            </MoreGroup>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isOwner ? '删除家庭' : '退出家庭'}
              accessibilityHint={isOwner && !canDelete ? '成员或宠物未清空，当前不能删除家庭' : undefined}
              accessibilityState={{ disabled: isOwner && !canDelete }}
              disabled={isOwner && !canDelete}
              onPress={() => setConfirm(isOwner ? 'delete' : 'leave')}
              style={[styles.dangerLink, { opacity: isOwner && !canDelete ? 0.45 : 1 }]}
            >
              <Trash size={16} color={theme.colors.danger} />
              <AppText color={theme.colors.danger}>{isOwner ? '删除家庭' : '退出家庭'}</AppText>
            </Pressable>
          </FadeInView>
        </View>
      </View>

      <InviteSheet
        visible={inviteOpen}
        familyId={family.id}
        familyName={family.name}
        onClose={() => setInviteOpen(false)}
      />

      {edit ? (
        <FamilyEdit
          family={family}
          onClose={() => setEdit(false)}
          onSaved={async () => {
            setEdit(false)
            await query.refetch()
            invalidateAfterFamilyChange(client)
          }}
        />
      ) : null}

      {transferOpen ? (
        <TransferOwner
          familyId={family.id}
          members={members.filter((member) => member.role !== 'owner')}
          onClose={() => setTransferOpen(false)}
          onSaved={async () => {
            setTransferOpen(false)
            await query.refetch()
            invalidateAfterFamilyChange(client)
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={Boolean(confirm)}
        title={
          confirm === 'delete'
            ? `删除「${family.name}」？`
            : confirm === 'leave'
              ? `退出「${family.name}」？`
              : `移除 ${typeof confirm === 'object' && confirm ? confirm.display_name : ''}？`
        }
        consequence={
          confirm === 'delete'
            ? '成员关系立即结束；已链接的宠物和历史依然受保护保留，之后可以恢复。'
            : confirm === 'leave'
              ? '你的访问会立即结束；已有历史不受影响。'
              : '对方的访问会立即结束；已有历史不受影响。'
        }
        confirmLabel={
          confirm === 'delete' ? '删除家庭' : confirm === 'leave' ? '退出家庭' : '移除成员'
        }
        requireText={confirm === 'delete' ? family.name : undefined}
        onCancel={() => setConfirm(null)}
        onConfirm={destructive}
      />
      <ConfirmDialog
        visible={Boolean(petToRemove)}
        title={`从「${family.name}」移出 ${petToRemove?.name ?? ''}？`}
        consequence="只解除这个家庭的关联；宠物档案、历史记录、其他家庭和宠物所有权都不会改变。"
        confirmLabel="移出家庭"
        onCancel={() => setPetToRemove(null)}
        onConfirm={() => void removePetFromFamily()}
      />
    </Screen>
  )
}

function IncomingTransferCard({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { theme } = useTheme()
  return (
    <Card style={[styles.incomingTransferCard, { backgroundColor: theme.colors.sageSoft }]}>
      <View style={styles.governanceHeader}>
        <ArrowsLeftRight size={20} color={theme.colors.forest2} weight="bold" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">有宠物申请转入</AppText>
          <AppText variant="caption" muted>
            {count} 条转移请求等待你确认。接受后，这只宠物会出现在本家庭的宠物列表。
          </AppText>
        </View>
      </View>
      <Button label="查看转移请求" variant="secondary" onPress={onOpen} />
    </Card>
  )
}

function IncomingTransferErrorCard({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme()
  return (
    <Card style={[styles.incomingTransferCard, { backgroundColor: theme.colors.coralSoft }]}>
      <View style={styles.governanceHeader}>
        <WarningCircle size={20} color={theme.colors.coralDark} weight="fill" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">转移请求暂时无法加载</AppText>
          <AppText accessibilityRole="alert" variant="caption" color={theme.colors.coralDark}>
            未能确认收到的宠物转移请求；请重试后再继续管理。
          </AppText>
        </View>
      </View>
      <Button label="重试加载转移请求" variant="secondary" onPress={onRetry} />
    </Card>
  )
}

function FamilyWorkspaceHero({
  family,
  memberCount,
  petCount,
  pendingCount,
  completedCount,
  readOnly,
  onToday,
  onAddPet,
  onInvite,
}: {
  family: Family
  memberCount: number
  petCount: number
  pendingCount: number
  completedCount: number
  readOnly: boolean
  onToday: () => void
  onAddPet: () => void
  onInvite: () => void
}) {
  const { theme } = useTheme()
  return (
    <View
      accessibilityLabel={`${family.name} 家庭工作区`}
      style={[styles.workspaceHero, { backgroundColor: theme.colors.forest2, borderRadius: theme.radius.xl }]}
    >
      <View style={styles.workspaceHeroTop}>
        <View style={[styles.workspaceAvatar, { backgroundColor: theme.colors.coralSoft }]}>
          <House size={34} color={theme.colors.coralDark} weight="duotone" />
        </View>
        <View style={styles.workspaceIdentity}>
          <AppText variant="eyebrow" color={theme.colors.mint}>家庭</AppText>
          <AppText variant="title" color={theme.colors.onBrand} numberOfLines={1}>{family.name}</AppText>
          <AppText variant="caption" color={theme.colors.onBrandMuted} numberOfLines={1}>
            你是{roleLabel(family.role)} · {timezoneCity(family.timezone)}
          </AppText>
          <View style={styles.workspaceFamilyLine}>
            <Users size={14} color={theme.colors.mint} weight="bold" />
            <AppText variant="caption" color={theme.colors.mint}>{memberCount} 位成员 · {petCount} 只宠物</AppText>
          </View>
          {readOnly ? <AppText variant="caption" color={theme.colors.onBrandMuted}>只查看成员</AppText> : null}
        </View>
        <View style={styles.workspaceStatus}>
          <AppText variant="caption" color={theme.colors.onBrandMuted}>今天</AppText>
          <AppText variant="display" color={pendingCount > 0 ? theme.colors.onBrand : theme.colors.mint}>{pendingCount}</AppText>
          <AppText variant="caption" color={theme.colors.onBrandMuted}>{pendingCount > 0 ? '项待处理' : '已处理完'}</AppText>
          <PressableScale
            accessibilityRole="button"
            onPress={onToday}
            style={[styles.workspacePrimary, { backgroundColor: theme.colors.mint }]}
          >
            <Clock size={16} color={theme.colors.forest2} weight="bold" />
            <AppText variant="label" color={theme.colors.forest2}>打开今天</AppText>
          </PressableScale>
        </View>
      </View>
      <View style={[styles.workspaceHeroBottom, { borderTopColor: theme.colors.onBrandSoft }]}>
        <View style={styles.workspaceProgress}>
          <AppText variant="caption" color={theme.colors.onBrandMuted}>完成进度</AppText>
          <AppText variant="label" color={theme.colors.onBrand}>{completedCount} 项已完成 · {pendingCount} 项待处理</AppText>
        </View>
        {!readOnly ? (
          <View style={styles.workspaceHeroActions}>
            <PressableScale accessibilityRole="button" onPress={onAddPet} style={styles.workspaceLinkCompact}>
              <PawPrint size={17} color={theme.colors.mint} weight="bold" />
              <AppText variant="label" color={theme.colors.onBrand}>添加宠物</AppText>
            </PressableScale>
            <PressableScale accessibilityRole="button" onPress={onInvite} style={styles.workspaceLinkCompact}>
              <Users size={17} color={theme.colors.mint} weight="bold" />
              <AppText variant="label" color={theme.colors.onBrand}>邀请成员</AppText>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  family_created: '创建了家庭',
  family_updated: '修改了家庭设置',
  family_deleted: '删除了家庭',
  family_restored: '恢复了家庭',
  member_joined: '加入了家庭',
  member_left: '离开了家庭',
  member_removed: '移除了成员',
  member_role_changed: '调整了成员权限',
  ownership_transferred: '转让了管理员权限',
  pet_created: '添加了宠物',
  pet_updated: '修改了宠物档案',
  pet_record_updated: '修改了宠物资料',
  pet_shared_with_family: '把宠物加入了家庭',
  pet_unshared_from_family: '移除了家庭里的宠物关联',
  pet_removed_from_family: '把宠物移出了家庭',
  pet_access_granted: '授予了宠物查看权限',
  pet_access_revoked: '撤销了宠物查看权限',
  pet_archived: '归档了宠物',
  pet_restored: '恢复了宠物',
  pet_deleted: '删除了宠物',
  pet_transfer_requested: '发起了宠物转移',
  pet_transfer_accepted: '接受了宠物转移',
  pet_transfer_declined: '拒绝了宠物转移',
  pet_transfer_cancelled: '撤回了宠物转移',
  care_plan_created: '新增了照护计划',
  care_plan_updated: '修改了照护计划',
  care_plan_archived: '暂停了照护计划',
  care_plan_restored: '恢复了照护计划',
  care_assignment_added: '增加了照护负责人',
  care_assignment_reordered: '调整了负责人顺序',
  care_assignment_removed: '移除了照护负责人',
  share_created: '创建了外部分享',
  share_revoked: '撤销了外部分享',
}

function auditSubject(record: FamilyAuditRecord) {
  const metadata = record.metadata ?? {}
  const subject = record.resource_type === 'care_plan' ? metadata.title : metadata.name
  return typeof subject === 'string' && subject.trim() ? `「${subject.trim()}」` : ''
}

function FamilyAuditCard({
  records,
  timezone,
  loading,
  error,
  onRetry,
}: {
  records: FamilyAuditRecord[]
  timezone: string
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  const { theme } = useTheme()
  return (
    <Card style={styles.auditCard}>
      <View style={styles.governanceHeader}>
        <ClockCounterClockwise size={20} color={theme.colors.forest2} weight="bold" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">最近变更</AppText>
          <AppText variant="caption" muted>家庭成员和管理员操作会留在这里。</AppText>
        </View>
      </View>
      {loading ? (
        <AppText variant="caption" muted>正在读取变更记录…</AppText>
      ) : error ? (
        <View style={styles.auditError}>
          <AppText accessibilityRole="alert" variant="caption" color={theme.colors.coralDark} style={{ flex: 1 }}>
            变更记录暂时无法更新
          </AppText>
          <Button label="重试" variant="ghost" onPress={onRetry} />
        </View>
      ) : records.length === 0 ? (
        <AppText variant="caption" muted>还没有家庭治理变更。</AppText>
      ) : (
        <View style={styles.auditList}>
          {records.slice(0, 8).map((record) => (
            <View key={record.id} style={[styles.auditRow, { borderTopColor: theme.colors.line }]}>
              <View style={[styles.auditDot, { backgroundColor: theme.colors.sageSoft }]}>
                <CheckCircle size={14} color={theme.colors.forest2} weight="fill" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={2}>
                  {record.actor_name} {AUDIT_ACTION_LABELS[record.action] ?? '进行了家庭变更'}{auditSubject(record)}
                </AppText>
                <AppText variant="caption" muted>
                  {formatAuditTime(record.occurred_at, timezone)}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  )
}

function formatAuditTime(value: string, timezone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function FamilyGovernanceCard({
  memberCount,
  petCount,
  canDelete,
}: {
  memberCount: number
  petCount: number
  canDelete: boolean
}) {
  const { theme } = useTheme()
  const additionalMemberCount = Math.max(0, memberCount - 1)
  const memberReady = additionalMemberCount === 0
  const petsReady = petCount === 0
  return (
    <Card style={styles.governanceCard}>
      <View style={styles.governanceHeader}>
        {canDelete ? (
          <CheckCircle size={20} color={theme.colors.mintStrong} weight="fill" />
        ) : (
          <WarningCircle size={20} color={theme.colors.coralDark} weight="fill" />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">{canDelete ? '家庭已清空' : '家庭管理状态'}</AppText>
          <AppText variant="caption" muted>
            {canDelete
              ? '成员和宠物都已移出，现在可以删除这个家庭。'
              : '删除家庭前，必须先移除其他成员并移出所有宠物。'}
          </AppText>
        </View>
      </View>
      <View style={styles.governanceList}>
        <GovernanceRow
          ready={memberReady}
          label="其他成员"
          detail={memberReady ? '已清空' : `还剩 ${additionalMemberCount} 位，需要先移除`}
        />
        <GovernanceRow
          ready={petsReady}
          label="家庭宠物"
          detail={petsReady ? '已清空' : `还剩 ${petCount} 只，需要先移出家庭`}
        />
      </View>
    </Card>
  )
}

function GovernanceRow({
  ready,
  label,
  detail,
}: {
  ready: boolean
  label: string
  detail: string
}) {
  const { theme } = useTheme()
  return (
    <View style={[styles.governanceRow, { borderTopColor: theme.colors.line }]}>
      {ready ? (
        <CheckCircle size={17} color={theme.colors.mintStrong} weight="fill" />
      ) : (
        <WarningCircle size={17} color={theme.colors.coralDark} weight="fill" />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" color={ready ? theme.colors.forest2 : theme.colors.coralDark}>
          {detail}
        </AppText>
      </View>
    </View>
  )
}

function FamilyTodayCard({
  family,
  today,
  loading,
  error,
  onRetry,
  onOpenToday,
}: {
  family: Family
  today?: Today
  loading: boolean
  error: unknown
  onRetry: () => void
  onOpenToday: (taskId?: string) => void
}) {
  const { theme } = useTheme()
  const items = (today?.pets ?? [])
    .flatMap((group) => group.items.map((item) => ({ ...item, petName: group.pet_name })))
    .sort((a, b) => {
      const sortValue = (item: typeof a) => {
        if (item.task.due_at) {
          const absolute = new Date(item.task.due_at).getTime()
          if (Number.isFinite(absolute)) return absolute
        }
        if (item.task.time_of_day) {
          const local = Date.parse(`1970-01-01T${item.task.time_of_day}:00Z`)
          if (Number.isFinite(local)) return local
        }
        return Number.MAX_SAFE_INTEGER
      }
      return sortValue(a) - sortValue(b)
    })
  const pending = items.filter(isCareOpen)
  const completed = items.filter((item) => item.log?.status === 'done' || item.log?.status === 'completed').length
  const skipped = items.filter((item) => item.log?.status === 'skipped').length
  const next = pending[0]
  const laterPending = pending.slice(1, 4)

  return (
    <Card style={[styles.todayCard, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line }]}>
      <View style={styles.todayCardHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="eyebrow" soft>{family.name} · 今天</AppText>
          <AppText variant="heading">
            {loading ? '正在读取今天的安排' : pending.length > 0 ? `${pending.length} 项还没处理` : '今天没有待处理事项'}
          </AppText>
        </View>
      </View>

      {error ? (
        <View style={[styles.todayError, { backgroundColor: theme.colors.coralSoft }]}>
          <AppText accessibilityRole="alert" variant="caption" color={theme.colors.coralDark} style={{ flex: 1 }}>
            今天的安排暂时无法更新
          </AppText>
          <Button label="重试" variant="ghost" onPress={onRetry} />
        </View>
      ) : loading ? (
        <AppText variant="caption" muted>家庭成员和宠物准备好后，这里会显示今天的安排。</AppText>
      ) : (
        <>
          <View style={[styles.todayStats, { borderTopColor: theme.colors.line }]}>
            <View style={styles.todayStat}>
              <Clock size={16} color={theme.colors.coralDark} weight="bold" />
              <AppText variant="label" color={theme.colors.coralDark}>{pending.length}</AppText>
              <AppText variant="caption" muted>待处理</AppText>
            </View>
            <View style={styles.todayStat}>
              <CheckCircle size={16} color={theme.colors.forest2} weight="bold" />
              <AppText variant="label" color={theme.colors.forest2}>{completed}</AppText>
              <AppText variant="caption" muted>已完成</AppText>
            </View>
            {skipped > 0 ? (
              <View style={styles.todayStat}>
                <AppText variant="label" muted>{skipped}</AppText>
                <AppText variant="caption" muted>已跳过</AppText>
              </View>
            ) : null}
          </View>
          {pending.length > 0 || completed > 0 ? (
            <FamilyResponsibilitySummary items={pending} completedItems={items} />
          ) : null}
          {next ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`打开今天的${next.petName} ${next.task.title}`}
              onPress={() => onOpenToday(next.task.id)}
              style={[styles.nextCare, { backgroundColor: theme.colors.sageSoft }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="caption" color={theme.colors.forest2}>下一项</AppText>
                <AppText variant="label" numberOfLines={1}>{next.petName} · {next.task.title}</AppText>
              </View>
              <AppText variant="caption" muted>{next.task.time_of_day || '时间未定'}</AppText>
              <CaretRight size={17} color={theme.colors.forest2} weight="bold" />
            </PressableScale>
          ) : (
            <AppText variant="caption" muted>完成情况会记录在每只宠物的时间线里。</AppText>
          )}
          {laterPending.length > 0 ? (
            <View style={[styles.todayList, { borderTopColor: theme.colors.line }]}>
              <AppText variant="caption" muted>之后还有</AppText>
              {laterPending.map((item) => (
                <PressableScale
                  key={item.task.id}
                  accessibilityRole="button"
                  accessibilityLabel={`打开今天的${item.petName} ${item.task.title}`}
                  onPress={() => onOpenToday(item.task.id)}
                  style={styles.todayListRow}
                >
                  <AppText variant="caption" muted style={styles.todayListTime}>
                    {item.task.time_of_day || '待定'}
                  </AppText>
                  <View style={{ flex: 1, gap: 1 }}>
                    <AppText variant="label" numberOfLines={1}>{item.petName} · {item.task.title}</AppText>
                    <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
                      {familyTodayItemStatus(item)}
                    </AppText>
                  </View>
                  <CaretRight size={15} color={theme.colors.soft} weight="bold" />
                </PressableScale>
              ))}
              {pending.length > 4 ? (
                <AppText variant="caption" color={theme.colors.forest2}>
                  还有 {pending.length - 4} 项，打开今天查看全部
                </AppText>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </Card>
  )
}

function FamilyResponsibilitySummary({ items, completedItems }: { items: TodayItem[]; completedItems: TodayItem[] }) {
  const { theme } = useTheme()
  const counts = new Map<string, { key: string; label: string; count: number; unassigned: boolean }>()
  for (const item of items) {
    const responsibility = familyTodayResponsibility(item)
    const label = responsibility.label
    const key = responsibility.key
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { key, label, count: 1, unassigned: responsibility.unassigned })
  }
  const groups = [...counts.values()].sort((a, b) => {
    if (a.unassigned !== b.unassigned) return a.unassigned ? -1 : 1
    return b.count - a.count || a.label.localeCompare(b.label)
  })
  const completedCounts = new Map<string, number>()
  for (const item of completedItems) {
    if (item.log?.status !== 'done' && item.log?.status !== 'completed') continue
    const label = item.log.done_by_name || '家庭成员'
    completedCounts.set(label, (completedCounts.get(label) ?? 0) + 1)
  }
  const completedGroups = [...completedCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  return (
    <View style={[styles.responsibilitySummary, { borderTopColor: theme.colors.line }]}>
      {groups.length > 0 ? (
        <>
          <AppText variant="caption" muted>现在谁在做</AppText>
          <View style={styles.responsibilityPills}>
            {groups.map((group) => (
              <View
                key={group.key}
                style={[
                  styles.responsibilityPill,
                  {
                    backgroundColor: group.unassigned ? theme.colors.coralSoft : theme.colors.sageSoft,
                    borderRadius: theme.radius.pill,
                  },
                ]}
              >
                <AppText variant="caption" color={group.unassigned ? theme.colors.coralDark : theme.colors.forest2}>
                  {group.label} · {group.count}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {completedGroups.length > 0 ? (
        <View style={[styles.completedSummary, { borderTopColor: theme.colors.line }]}>
          <AppText variant="caption" muted>今天谁已完成</AppText>
          <View style={styles.responsibilityPills}>
            {completedGroups.map(([label, count]) => (
              <View
                key={label}
                style={[styles.responsibilityPill, { backgroundColor: theme.colors.mint, borderRadius: theme.radius.pill }]}
              >
                <AppText variant="caption" color={theme.colors.forest2}>{label} · {count}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

function familyTodayResponsibility(item: TodayItem) {
  const request = item.care_request
  if (request?.state === 'sent' || request?.state === 'seen') {
    const target = request.target_user_name || '成员'
    return { key: `waiting:${request.target_user_id || target}`, label: `等${target}回应`, unassigned: false }
  }
  if (request?.state === 'accepted') {
    const target = request.target_user_name || '成员'
    return { key: `assigned:${request.target_user_id || target}`, label: target, unassigned: false }
  }
  if (request?.state === 'delegated' && request.next_target_user_name) {
    const target = request.next_target_user_name
    return { key: `assigned:${request.next_target_user_id || target}`, label: target, unassigned: false }
  }
  if (item.task.assigned_to_name) {
    return {
      key: `assigned:${item.task.assigned_to_user_id || item.task.assigned_to_name}`,
      label: item.task.assigned_to_name,
      unassigned: false,
    }
  }
  return { key: 'unassigned', label: '还没人负责', unassigned: true }
}

function familyTodayItemStatus(item: TodayItem) {
  const request = item.care_request
  if (request?.state === 'sent' || request?.state === 'seen') {
    return `等 ${request.target_user_name} 回应`
  }
  if (request?.state === 'accepted') {
    return `由 ${request.target_user_name} 负责`
  }
  if (request?.state === 'delegated') {
    return request.next_target_user_name ? `已转给 ${request.next_target_user_name}` : '正在重新安排'
  }
  return item.task.assigned_to_name ? `负责人 · ${item.task.assigned_to_name}` : '还没人负责'
}

function FamilyPetRow({
  pet,
  todaySummary,
  onOpen,
  onRemove,
}: {
  pet: Pet
  todaySummary?: {
    pending: number
    next?: TodayItem
  }
  onOpen: () => void
  onRemove?: () => void
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.petRow}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`打开宠物 ${pet.name}`}
        onPress={onOpen}
        style={styles.petMain}
      >
        <View style={[styles.avatar, { backgroundColor: theme.colors.sageSoft }]}>
          <PetAvatar petId={pet.id} species={pet.species} size={38} decorative />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" numberOfLines={1}>{pet.name}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {[pet.breed || speciesLabel(pet.species), ageShort(pet.birth_date ?? undefined)]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          {todaySummary ? (
            <AppText variant="caption" color={todaySummary.pending > 0 ? theme.colors.coralDark : theme.colors.forest2} numberOfLines={1}>
              {todaySummary.pending > 0
                ? `今天还有 ${todaySummary.pending} 项`
                : '今天已处理'}
              {todaySummary.next
                ? ` · 下一项 ${todaySummary.next.task.time_of_day || '时间未定'}`
                : ''}
            </AppText>
          ) : null}
        </View>
      </PressableScale>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`从当前家庭移出 ${pet.name}`}
          onPress={onRemove}
          style={styles.petRemove}
        >
          <Trash size={16} color={theme.colors.coralDark} />
        </Pressable>
      ) : null}
    </View>
  )
}

function FamilyEdit({
  family,
  onClose,
  onSaved,
}: {
  family: Family
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const [name, setName] = useState(family.name)
  const [timezone, setTimezone] = useState(family.timezone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) {
      setError('请填写家庭名称。')
      return
    }
    setBusy(true)
    setError('')
    try {
      await planetApi.families.update(family.id, { name: name.trim(), timezone })
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        家庭设置
      </AppText>
      <AppText variant="heading">家庭信息</AppText>
      <TextField label="名称" value={name} onChangeText={setName} maxLength={80} />
      <TimezoneField
        value={timezone}
        onChange={setTimezone}
        hint="改动会影响家庭「今天」的边界与提醒时间。"
      />
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label="保存修改" busy={busy} onPress={() => void save()} style={{ flex: 1 }} />
      </View>
    </ModalSheet>
  )
}

function TransferOwner({
  familyId,
  members,
  onClose,
  onSaved,
}: {
  familyId: string
  members: Member[]
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const commandKey = useRef<{ userId: string; key: string } | null>(null)
  const chosen = members.find((member) => member.user_id === userId)

  async function transfer(): Promise<boolean> {
    if (!userId) {
      setError('请先选择接任的成员。')
      return false
    }
    setBusy(true)
    setError('')
    const requestKey =
      commandKey.current?.userId === userId
        ? commandKey.current.key
        : createIdempotencyKey()
    commandKey.current = { userId, key: requestKey }
    try {
      await planetApi.families.transfer(familyId, userId, requestKey)
      commandKey.current = null
      onSaved()
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        家庭治理
      </AppText>
      <AppText variant="heading">转让管理员</AppText>
      <AppText muted style={{ marginBottom: 4 }}>
        转让后对方成为家庭管理员，你会变成照护者，随时仍可参与照护。
      </AppText>
      <View style={{ gap: 8 }}>
        {members.map((member) => {
          const selected = member.user_id === userId
          return (
            <Pressable
              key={member.user_id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                void hapticSelection()
                if (member.user_id !== userId) {
                  setUserId(member.user_id)
                  commandKey.current = { userId: member.user_id, key: createIdempotencyKey() }
                }
                if (error) setError('')
              }}
              style={[
                styles.candidate,
                {
                  borderColor: selected ? theme.colors.forest2 : theme.colors.line,
                  backgroundColor: selected ? theme.colors.sageSoft : theme.colors.paper,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: theme.colors.sageSoft }]}>
                <AppText variant="label" color={theme.colors.forest2}>
                  {member.display_name.slice(0, 1).toUpperCase()}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText variant="label">{member.display_name}</AppText>
                {member.email ? (
                  <AppText variant="caption" muted numberOfLines={1}>
                    {member.email}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          )
        })}
      </View>
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label={chosen ? `转让给 ${chosen.display_name}` : '确认转让'}
          busy={busy}
          disabled={!userId}
          onPress={() => setConfirmOpen(true)}
          style={{ flex: 1 }}
        />
      </View>
      <ConfirmDialog
        visible={confirmOpen}
        title={chosen ? `把管理员交给 ${chosen.display_name}？` : '确认转让管理员？'}
        consequence={chosen ? `${chosen.display_name} 会成为家庭管理员，你会变成照护者；宠物和历史不会受影响。` : '转让后你会变成照护者。'}
        confirmLabel={chosen ? `确认交给 ${chosen.display_name}` : '确认转让'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const succeeded = await transfer()
          if (succeeded) setConfirmOpen(false)
        }}
      />
    </ModalSheet>
  )
}

function ageShort(birthDate: string | undefined): string {
  if (!birthDate) return ''
  const text = ageText(birthDate)
  if (text.includes('个月') || text === '未满月') return '未满岁'
  return text
}

const styles = StyleSheet.create({
  workspaceHero: {
    padding: 18,
    gap: 15,
  },
  workspaceHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  workspaceAvatar: {
    width: 68,
    height: 68,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceIdentity: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  workspaceFamilyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  workspaceStatus: {
    alignItems: 'flex-end',
    gap: 1,
  },
  workspacePrimary: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    marginTop: 7,
  },
  workspaceHeroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
  },
  workspaceProgress: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  workspaceHeroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workspaceLinkCompact: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
  },
  hero: {
    gap: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heroActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  detailColumns: {
    gap: 18,
  },
  detailColumnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailColumn: {
    gap: 18,
    minWidth: 0,
  },
  detailColumnWide: {
    flex: 1,
  },
  todayCard: {
    gap: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  todayStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nextCare: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  todayError: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  todayList: {
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  responsibilitySummary: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  completedSummary: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  responsibilityPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  responsibilityPill: { paddingHorizontal: 9, paddingVertical: 6 },
  todayListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  todayListTime: { width: 48 },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  petMain: {
    flex: 1,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 15,
  },
  petRemove: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  roleButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  dangerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  governanceCard: { gap: 14 },
  incomingTransferCard: { gap: 12 },
  auditCard: { gap: 12 },
  auditList: { gap: 0 },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  auditDot: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  governanceHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  governanceList: { gap: 0 },
  governanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
})
