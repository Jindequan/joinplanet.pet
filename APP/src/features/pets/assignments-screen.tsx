import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretDown, CaretUp } from 'phosphor-react-native'
import { planetApi, type Member } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { roleLabel } from '../../core/display'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useSession } from '../../core/providers/session-provider'
import { invalidateAfterCarePlanChange } from '../../core/foundation'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { FadeInView } from '../../ui/motion'

export function AssignmentsScreen({
  petId,
  planId,
  familyId,
}: {
  petId: string
  planId: string
  familyId?: string
}) {
  const { theme } = useTheme()
  const { userId } = useSession()
  const client = useQueryClient()
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => planetApi.pets.get(petId),
    enabled: Boolean(petId),
  })
  const plans = useQuery({
    queryKey: queryKeys.carePlans(petId, false, familyId),
    queryFn: () => planetApi.pets.carePlans(petId, false, familyId),
    enabled: Boolean(petId),
  })
  const selectedPlan = (plans.data?.care_plans ?? []).find((plan) => plan.id === planId)
  const planTitle = selectedPlan?.title
  // Family-owned plans have their own member boundary. Preserve it even when
  // an old deep link omitted family_id; only legacy Pet-owned plans may use
  // every Family linked to the Pet.
  const planFamilyId = familyId ?? selectedPlan?.family_id
  // A scoped route is authoritative. If it is stale (for example after a
  // transfer), never widen the member list to every Family linked to the Pet.
  const familyIds = planFamilyId
    ? [planFamilyId]
    : pet.data?.pet.family_ids ?? []
  const familyQueries = useQueries({
    queries: familyIds.map((familyId) => ({
      queryKey: queryKeys.family(familyId),
      queryFn: () => planetApi.families.detail(familyId),
      enabled: Boolean(familyId),
    })),
  })
  const assignments = useQuery({
    queryKey: queryKeys.assignments(planId, planFamilyId),
    queryFn: () => planetApi.carePlans.assignments(planId, planFamilyId),
    enabled: Boolean(planId),
  })
  const [busyUser, setBusyUser] = useState('')
  const [movingUser, setMovingUser] = useState('')
  const [removeUser, setRemoveUser] = useState<Member | null>(null)
  const [error, setError] = useState('')

  const familyMembers = useMemo(() => {
    const membersById = new Map<string, Member>()
    for (const result of familyQueries) {
      for (const member of result.data?.members ?? []) {
        if (!membersById.has(member.user_id)) membersById.set(member.user_id, member)
      }
    }
    return [...membersById.values()]
  }, [familyQueries])
  const participatingMembers = useMemo(
    () => familyMembers.filter((member) => member.role !== 'viewer' && member.role !== 'read_only'),
    [familyMembers],
  )
  const viewOnlyMembers = useMemo(
    () => familyMembers.filter((member) => member.role === 'viewer' || member.role === 'read_only'),
    [familyMembers],
  )
  const role = planFamilyId
    ? pet.data?.pet.family_roles?.[planFamilyId]
    : pet.data?.pet.access_role
  const readOnly = !role || role === 'viewer' || role === 'read_only'
  const canManage = !readOnly && (
    pet.data?.pet.current_owner_user_id === userId ||
    (planFamilyId ? role === 'owner' : false)
  )
  const assignmentsByUser = new Map(
    (assignments.data?.assignments ?? []).map((assignment) => [assignment.user_id, assignment]),
  )
  const helperAssignments = (assignments.data?.assignments ?? []).filter((item) => item.role === 'helper')
  const orderedMembers = useMemo(() => {
    const members = participatingMembers
    const membersById = new Map(members.map((member) => [member.user_id, member]))
    const assigned = (assignments.data?.assignments ?? [])
      .slice()
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
        return a.priority - b.priority || a.created_at.localeCompare(b.created_at)
      })
      .map((assignment) => membersById.get(assignment.user_id))
      .filter((member): member is Member => Boolean(member))
    const assignedIds = new Set(assigned.map((member) => member.user_id))
    return [...assigned, ...members.filter((member) => !assignedIds.has(member.user_id))]
  }, [assignments.data?.assignments, participatingMembers])

  async function setAssignment(userId: string, shouldAssign: boolean) {
    setBusyUser(userId)
    setError('')
    try {
      if (shouldAssign) await planetApi.carePlans.setAssignment(planId, userId, 'helper')
      else await planetApi.carePlans.removeAssignment(planId, userId)
      invalidateAfterCarePlanChange(client, petId)
      const refreshed = await assignments.refetch()
      if (refreshed.error) throw refreshed.error
      setRemoveUser(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusyUser('')
    }
  }

  async function moveAssignment(userId: string, direction: 'up' | 'down') {
    setMovingUser(userId)
    setError('')
    try {
      await planetApi.carePlans.moveAssignment(planId, userId, direction)
      invalidateAfterCarePlanChange(client, petId)
      const refreshed = await assignments.refetch()
      if (refreshed.error) throw refreshed.error
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setMovingUser('')
    }
  }

  const familyLoading = familyQueries.some((query) => query.isLoading)
  const familyError = familyQueries.find((query) => query.error)?.error
  const familyName = planFamilyId
    ? familyQueries.find((query) => query.data?.family.id === planFamilyId)?.data?.family.name
    : undefined
  const loading = pet.isLoading || familyLoading || assignments.isLoading

  return (
    <Screen>
      <BackHeader
        title="谁来做"
        fallbackHref={`/pets/${petId}/care${planFamilyId ? `?familyId=${encodeURIComponent(planFamilyId)}` : ''}`}
        eyebrow={familyName ? `${familyName} · ${planTitle ?? '照护计划'}` : planTitle}
        subtitle="如果前面的人没做，系统会按下面的顺序问其他成员；对方答应后，这件事会出现在他的清单里。"
      />
      {loading ? (
        <LoadingState label="正在加载负责人顺序" />
      ) : pet.error || familyError || assignments.error ? (
        <QueryErrorState
          error={pet.error ?? familyError ?? assignments.error}
          onRetry={() => {
            void pet.refetch()
            for (const familyQuery of familyQueries) void familyQuery.refetch()
            void assignments.refetch()
          }}
        />
      ) : (
        <FadeInView>
        <Card style={{ gap: 12 }}>
          {orderedMembers.map((member) => {
            const assignment = assignmentsByUser.get(member.user_id)
            const isAssigned = Boolean(assignment)
            const isOwner = assignment?.role === 'owner'
            const helperIndex = helperAssignments.findIndex((item) => item.user_id === member.user_id)
            return (
              <View key={member.user_id} style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.sageSoft }]}>
                  <AppText variant="label" color={theme.colors.forest2}>
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.nameLine}>
                    <AppText variant="label">{member.display_name}</AppText>
                    {isAssigned ? (
                      <View
                        style={[
                          styles.pill,
                          { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.pill },
                        ]}
                      >
                        <AppText variant="caption" color={theme.colors.forest2}>
                          {isOwner ? '主负责人' : `备用 ${helperIndex + 1}`}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText variant="caption" muted>
                    {member.email ?? roleLabel(member.role)}
                  </AppText>
                </View>
                {!canManage ? (
                  <AppText variant="caption" soft>只查看</AppText>
                ) : (
                  <Button
                    label={isOwner ? '主负责人' : isAssigned ? '移除备用' : '设为备用'}
                    variant={isAssigned ? 'ghost' : 'secondary'}
                    disabled={isOwner}
                    busy={busyUser === member.user_id}
                    onPress={() =>
                      isAssigned
                        ? setRemoveUser(member)
                        : void setAssignment(member.user_id, true)
                    }
                  />
                )}
                {isAssigned && !isOwner && canManage ? (
                  <View style={styles.moveActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`将 ${member.display_name} 上移`}
                      disabled={movingUser !== '' || helperIndex <= 0}
                      onPress={() => void moveAssignment(member.user_id, 'up')}
                      style={({ pressed }) => [styles.moveButton, { opacity: movingUser !== '' || helperIndex <= 0 ? 0.35 : pressed ? 0.6 : 1 }]}
                    >
                      <CaretUp size={16} color={theme.colors.forest2} weight="bold" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`将 ${member.display_name} 下移`}
                      disabled={movingUser !== '' || helperIndex < 0 || helperIndex >= helperAssignments.length - 1}
                      onPress={() => void moveAssignment(member.user_id, 'down')}
                      style={({ pressed }) => [styles.moveButton, { opacity: movingUser !== '' || helperIndex < 0 || helperIndex >= helperAssignments.length - 1 ? 0.35 : pressed ? 0.6 : 1 }]}
                    >
                      <CaretDown size={16} color={theme.colors.forest2} weight="bold" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )
          })}
          {participatingMembers.length <= 1 ? (
            <AppText muted>
              还没有可指派的成员。只查看成员不能负责照护；去家庭邀请一位可参与照护的成员。
            </AppText>
          ) : null}
          {!canManage ? (
            <AppText variant="caption" muted>
              {readOnly ? '你当前只有查看权限，不能调整负责人。' : '家庭 owner 或宠物所有者可以调整负责人；你可以查看当前顺序。'}
            </AppText>
          ) : null}
          {error ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
        </Card>
        {viewOnlyMembers.length > 0 ? (
          <Card style={{ gap: 8 }}>
            <AppText variant="label">只查看 · {viewOnlyMembers.length}</AppText>
            <AppText variant="caption" muted>这些成员能看到宠物和全部记录，但不会被安排照护。</AppText>
            {viewOnlyMembers.map((member) => (
              <View key={member.user_id} style={styles.viewerRow}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.sageSoft }]}>
                  <AppText variant="label" color={theme.colors.forest2}>
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{member.display_name}</AppText>
                  <AppText variant="caption" muted>{member.email ?? '家庭成员'}</AppText>
                </View>
                <AppText variant="caption" soft>不可负责</AppText>
              </View>
            ))}
          </Card>
        ) : null}
        </FadeInView>
      )}

      <ConfirmDialog
        visible={Boolean(removeUser)}
        title={`移除 ${removeUser?.display_name ?? ''} 的负责？`}
        consequence="对方将不再负责这个照护计划。"
        confirmLabel="移除负责人"
        onCancel={() => setRemoveUser(null)}
        onConfirm={() => setAssignment(removeUser!.user_id, false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { paddingHorizontal: 8, paddingVertical: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveActions: { flexDirection: 'row', gap: 2 },
  moveButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
