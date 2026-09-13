import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, View } from 'react-native'
import { ArrowRight, Check, Clock, Users } from 'phosphor-react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createIdempotencyKey,
  planetApi,
  type CareRequest,
  type Member,
  type Task,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { queryKeys } from '../../core/query/keys'
import { foundationReaders, invalidateAfterCareRequestChange } from '../../core/foundation'
import { formatCareCivilDate, formatCareInstant } from '../../core/time/civil'
import { CARE_ACTION_LABELS } from '../../core/presentation/terminology'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import {
  enqueueCareAction,
  readPendingCareActions,
  subscribeCareActionQueue,
  shouldRetryCareAction,
  syncCareActionQueue,
  type PendingCareAction,
} from '../../core/storage/care-action-queue'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { EmptyState } from '../../ui/components/empty-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { QueryRefreshState } from '../../ui/components/query-status'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, hapticSuccess, PressableScale } from '../../ui/motion'
import { careRequestRouteCopy, careRequestStatusCopy, careRequestStatusTitle, careRequestSubject } from './copy'
import { CareHandoffBatchInbox } from './batch-panel'

type ComposerMode =
  | { kind: 'create'; familyId: string; task: Task; currentUserId: string; petName?: string; familyName?: string; reason?: 'unavailable' }
  | { kind: 'handoff' | 'delegate' | 'reassign'; request: CareRequest; currentUserId: string }

export type CareRequestView = 'all' | 'incoming' | 'sent'

function requestDueLine(request: CareRequest) {
  if (request.due_at) return formatCareInstant(request.due_at, request.family_timezone)
  return formatCareCivilDate(request.due_date)
}

function taskDueLine(task: Task) {
  if (task.due_at) return formatCareInstant(task.due_at, task.timezone)
  if (task.due_date) return formatCareCivilDate(task.due_date)
  return task.time_of_day || '时间未定'
}

function composerAction(mode: ComposerMode, commandId: string): PendingCareAction {
  if (mode.kind === 'create') {
    return {
      userId: mode.currentUserId,
      commandId,
      kind: 'create',
      occurrenceId: mode.task.id,
      familyId: mode.familyId,
      targetUserId: '',
    }
  }
  if (mode.kind === 'handoff') {
    return {
      userId: mode.currentUserId,
      commandId,
      kind: 'handoff',
      occurrenceId: mode.request.occurrence_id,
      familyId: mode.request.family_id,
      targetUserId: '',
    }
  }
  return {
    userId: mode.currentUserId,
    commandId,
    kind: mode.kind,
    requestId: mode.request.id,
    occurrenceId: mode.request.occurrence_id,
    targetUserId: '',
  }
}

export function CareRequestComposer({
  mode,
  onClose,
  onSent,
}: {
  mode: ComposerMode | null
  onClose: () => void
  onSent?: () => void
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const [targetUserId, setTargetUserId] = useState('')
  const [message, setMessage] = useState('')

  const familyId = mode?.kind === 'create' ? mode.familyId : mode?.request.family_id
  const currentUserId = mode?.currentUserId ?? ''
  const carePlanId = mode?.kind === 'create' ? mode.task.care_plan_id : mode?.request.care_plan_id
  const members = useQuery({
    queryKey: familyId ? queryKeys.family(familyId) : ['family', 'none'],
    queryFn: () => planetApi.families.detail(familyId!),
    enabled: Boolean(familyId),
  })
  const assignments = useQuery({
    queryKey: carePlanId ? queryKeys.assignments(carePlanId, familyId) : ['care-plan-assignments', 'none'],
    queryFn: () => planetApi.carePlans.assignments(carePlanId!, familyId),
    enabled: Boolean(carePlanId),
  })
  const requestId = mode && mode.kind !== 'create' ? mode.request.id : ''
  const chain = useQuery({
    queryKey: requestId ? queryKeys.careRequestChain(requestId) : ['care-request-chain', 'none'],
    queryFn: () => planetApi.careRequests.chain(requestId),
    enabled: Boolean(requestId),
    refetchInterval: 8_000,
  })

  useEffect(() => {
    setTargetUserId('')
    setMessage(
      mode?.kind === 'create'
        ? mode.reason === 'unavailable'
          ? '我这次没时间，请帮我处理。'
          : ''
        : mode?.request.message || '',
    )
  }, [
    mode?.kind,
    mode?.kind === 'create' ? mode.task.id : mode?.request.id,
    mode?.kind === 'create' ? mode.reason : undefined,
  ])

  const orderedAssignments = useMemo(
    () => (assignments.data?.assignments ?? []).slice().sort((a, b) => {
      const roleOrder = (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1)
      return roleOrder || a.priority - b.priority || a.created_at.localeCompare(b.created_at)
    }),
    [assignments.data?.assignments],
  )
  const assignmentLabels = useMemo(() => {
    return new Map(
      orderedAssignments.map((assignment) => [
        assignment.user_id,
        assignment.role === 'owner' ? '通常由他做' : '也能帮忙',
      ]),
    )
  }, [orderedAssignments])
  const previouslyUnavailableIds = useMemo(
    () => new Set(
      (chain.data?.care_requests ?? [])
        .filter((item) => item.state === 'declined' || item.state === 'expired')
        .map((item) => item.target_user_id),
    ),
    [chain.data?.care_requests],
  )
  // A viewer can read the pet history but cannot accept or become a care
  // assignee. Keep them out of the picker so the user never sends a request
  // that the server must reject after selection.
  const otherMembers = useMemo(
    () => (members.data?.members ?? []).filter(
      (member) => member.user_id !== currentUserId && (member.role === 'owner' || member.role === 'caregiver'),
    ),
    [currentUserId, members.data?.members],
  )
  const viewOnlyMembers = useMemo(
    () => (members.data?.members ?? []).filter(
      (member) => member.user_id !== currentUserId && (member.role === 'viewer' || member.role === 'read_only'),
    ),
    [currentUserId, members.data?.members],
  )
  const availableMembers = useMemo(() => {
    const order = new Map(orderedAssignments.map((assignment, index) => [assignment.user_id, index]))
    return otherMembers
      .filter((member) => !previouslyUnavailableIds.has(member.user_id))
      .sort((a, b) =>
        (order.get(a.user_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.user_id) ?? Number.MAX_SAFE_INTEGER) ||
        a.display_name.localeCompare(b.display_name),
      )
  }, [orderedAssignments, otherMembers, previouslyUnavailableIds])
  const previouslyUnavailableMembers = otherMembers.filter((member) => previouslyUnavailableIds.has(member.user_id))

  const mutation = useMutation({
    mutationFn: async (commandId: string) => {
      if (!mode || !targetUserId || !familyId) throw new Error('请选择一位成员')
      const body = { target_user_id: targetUserId, message: message.trim() }
      if (mode.kind === 'create' || mode.kind === 'handoff') {
        const occurrenceId = mode.kind === 'create' ? mode.task.id : mode.request.occurrence_id
        return planetApi.careRequests.create(
          occurrenceId,
          { family_id: familyId, ...body },
          commandId,
        )
      }
      if (mode.kind === 'reassign') {
        return planetApi.careRequests.reassign(mode.request.id, body, commandId)
      }
      return planetApi.careRequests.delegate(mode.request.id, body, commandId)
    },
    onSuccess: () => {
      void hapticSuccess()
      invalidateAfterCareRequestChange(client)
      showToast({ message: mode?.kind === 'create' ? '请求已发出' : '已重新安排给其他人' })
      onSent?.()
      onClose()
    },
    onError: (error, commandId) => {
      if (mode && shouldRetryCareAction(error)) {
        const queued = composerAction(mode, commandId)
        queued.targetUserId = targetUserId
        queued.message = message.trim()
        void enqueueCareAction(queued)
          .then(() => {
            showToast({ message: '网络暂时不可用，已保存，联网后自动发送' })
            onClose()
          })
          .catch((saveError) => {
            showToast({ message: `离线保存失败：${errorMessage(saveError)}` })
          })
        return
      }
      showToast({ message: errorMessage(error) })
    },
  })

  if (!mode) return null
  const title =
    mode.kind === 'create'
      ? mode.reason === 'unavailable'
        ? `这次做不了：「${mode.task.title}」`
        : `把「${mode.task.title}」交给其他人`
      : mode.kind === 'reassign'
        ? '再找个人做这件事'
        : '把这件事交给其他人'
  const subtitle =
    mode.kind === 'create'
      ? mode.reason === 'unavailable'
        ? '选一位成员接手这一次；原来的安排不会重复生成。'
        : '选一位成员负责这一次；对方也可以继续转交。'
      : '还是这件事，不会重复出现。'
  const contextPetName = mode.kind === 'create' ? mode.petName : mode.request.pet_name
  const contextFamilyName = mode.kind === 'create'
    ? mode.familyName
    : members.data?.family.name
  const contextTitle = mode.kind === 'create' ? mode.task.title : mode.request.occurrence_title
  const contextDue = mode.kind === 'create' ? taskDueLine(mode.task) : requestDueLine(mode.request)
  const retryLookups = () => {
    void Promise.all([
      members.refetch(),
      carePlanId ? assignments.refetch() : Promise.resolve(),
      requestId ? chain.refetch() : Promise.resolve(),
    ])
  }
  const memberLookupFailed = members.isError
  const responsibilityChainFailed = Boolean(requestId && chain.isError)

  return (
    <ModalSheet visible onClose={onClose} busy={mutation.isPending}>
      <AppText variant="heading">{title}</AppText>
      <AppText muted style={{ marginBottom: 4 }}>
        {subtitle}
      </AppText>
      <View
        accessibilityLabel={`这一次照护：${contextPetName ? `${contextPetName} · ` : ''}${contextTitle}`}
        style={[styles.requestContext, { backgroundColor: theme.colors.coralSoft, borderColor: theme.colors.line }]}
      >
        <AppText variant="eyebrow" color={theme.colors.coralDark}>这一次照护</AppText>
        <AppText variant="label" numberOfLines={2}>
          {contextPetName ? `${contextPetName} · ` : ''}{contextTitle}
        </AppText>
        <AppText variant="caption" color={theme.colors.coralDark}>
          {contextFamilyName ? `${contextFamilyName} · ` : ''}{contextDue}
        </AppText>
      </View>
      <View style={{ gap: 8 }}>
        {members.isLoading ? <AppText muted>正在加载家庭成员…</AppText> : null}
        {carePlanId && assignments.isLoading ? <AppText muted>正在准备成员名单…</AppText> : null}
        {requestId && chain.isLoading ? <AppText muted>正在查看之前找过谁…</AppText> : null}
        {memberLookupFailed ? (
          <QueryErrorState
            embedded
            message="家庭成员暂时无法加载，不能安全地转交这件事。"
            onRetry={retryLookups}
          />
        ) : null}
        {!memberLookupFailed && assignments.isError ? (
          <QueryErrorState
            embedded
            message="成员的常用照护安排暂时无法加载；可以继续选择成员，重试后会恢复排序提示。"
            onRetry={retryLookups}
          />
        ) : null}
        {!memberLookupFailed && responsibilityChainFailed ? (
          <QueryErrorState
            embedded
            message="之前的转交记录暂时无法加载，请重试后再继续，避免重复发起请求。"
            onRetry={retryLookups}
          />
        ) : null}
        {availableMembers.map((member) => {
          const selected = member.user_id === targetUserId
          return (
            <MemberOption
              key={member.user_id}
              member={member}
              hint={assignmentLabels.get(member.user_id)}
              selected={selected}
              onPress={() => setTargetUserId(member.user_id)}
            />
          )
        })}
        {previouslyUnavailableMembers.length > 0 ? (
          <AppText variant="caption" muted>
            这些成员暂时不能做：{previouslyUnavailableMembers.map((member) => member.display_name).join('、')}
          </AppText>
        ) : null}
        {!members.isLoading && availableMembers.length === 0 ? (
          <View style={styles.emptyMembers}>
            <AppText muted>
              {previouslyUnavailableMembers.length > 0
                ? '现在找不到其他人，这件事先按原来的安排。'
                : viewOnlyMembers.length > 0
                  ? '其他成员目前只有只查看权限，不能接手照护。请邀请一位可参与照护的成员。'
                : '还没有其他成员，可以先邀请他们进来。'}
            </AppText>
            {previouslyUnavailableMembers.length === 0 ? (
              <Button
              label="邀请成员"
                variant="secondary"
                onPress={() => {
                  onClose()
                  if (familyId) router.push(`/families/${familyId}?invite=1` as never)
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <TextField
        label="给对方说一句（选填）"
        value={message}
        onChangeText={setMessage}
        maxLength={500}
        editable={!mutation.isPending}
        multiline
        placeholder="例如：我今天加班，晚上能帮忙遛狗吗？"
      />
      <View style={styles.actions}>
        <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label={mode.kind === 'create' ? '发出请求' : '发给这位成员'}
          busy={mutation.isPending}
          disabled={!targetUserId || availableMembers.length === 0 || memberLookupFailed || responsibilityChainFailed}
          onPress={() => mutation.mutate(createIdempotencyKey())}
          style={{ flex: 1 }}
        />
      </View>
    </ModalSheet>
  )
}

function MemberOption({
  member,
  hint,
  selected,
  onPress,
}: {
  member: Member
  hint?: string
  selected: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${member.display_name}${hint ? `，${hint}` : ''}${selected ? '，已选择' : ''}`}
      style={[
        styles.member,
        {
          backgroundColor: selected ? theme.colors.sageSoft : theme.colors.paper,
          borderColor: selected ? theme.colors.forest2 : theme.colors.line,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: selected ? theme.colors.forest2 : theme.colors.sageSoft }]}>
        <AppText variant="label" color={selected ? theme.colors.onBrand : theme.colors.forest2}>
          {member.display_name.slice(0, 1).toUpperCase()}
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{member.display_name}</AppText>
        <AppText variant="caption" muted>{hint ? `${hint} · ` : ''}{member.email || '家庭成员'}</AppText>
      </View>
      {selected ? <Check size={20} color={theme.colors.forest2} weight="bold" /> : null}
    </PressableScale>
  )
}

export function CareRequestInbox({
  currentUserId,
  requestId,
  detailOnly = false,
  showSent = false,
  showEmptyState = false,
  view = 'all',
}: {
  currentUserId: string
  requestId?: string
  detailOnly?: boolean
  showSent?: boolean
  showEmptyState?: boolean
  view?: CareRequestView
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { scope, setScope } = useScope()
  const client = useQueryClient()
  const { care_request_id: requestedId, care_action: requestedAction } = useLocalSearchParams<{
    care_request_id?: string
    care_action?: string
  }>()
  const requestedIdValue = requestId || (typeof requestedId === 'string' ? requestedId : '')
  const todayHref = scope.type === 'family'
    ? `/(tabs)?family_id=${encodeURIComponent(scope.id)}`
    : scope.type === 'pet'
      ? `/(tabs)?pet_id=${encodeURIComponent(scope.id)}${scope.familyId ? `&family_id=${encodeURIComponent(scope.familyId)}` : ''}`
      : '/(tabs)'
  const [composer, setComposer] = useState<ComposerMode | null>(null)
  const [pendingContinuation, setPendingContinuation] = useState<{ request: CareRequest; commandId: string } | null>(null)
  const [pendingActions, setPendingActions] = useState<PendingCareAction[]>([])
  const [syncingActions, setSyncingActions] = useState(false)
  const syncingActionsRef = useRef(false)
  const pendingActionsRef = useRef<PendingCareAction[]>([])
  const inbox = useQuery({
    queryKey: queryKeys.careRequestInbox,
    queryFn: () => planetApi.careRequests.inbox(),
    enabled: Boolean(currentUserId && currentUserId !== 'anonymous'),
    // IncomingRequestToast owns the shell-wide live refresh. Reuse its cache
    // here so opening Requests does not create a second inbox poller.
  })
  const sent = useQuery({
    queryKey: queryKeys.careRequestSent,
    queryFn: () => planetApi.careRequests.sent(),
    enabled: Boolean(currentUserId && currentUserId !== 'anonymous' && !detailOnly && showSent),
    refetchInterval: 8_000,
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const accessiblePets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })
  const batchInbox = useQuery({
    queryKey: queryKeys.careHandoffInbox,
    queryFn: () => planetApi.careHandoffBatches.inbox(),
    enabled: Boolean(currentUserId && currentUserId !== 'anonymous'),
    // IncomingRequestToast owns the shell-wide live refresh for this cache.
  })
  const requestedRequest = useQuery({
    queryKey: ['care-requests', 'request', requestedIdValue],
    queryFn: () => planetApi.careRequests.get(requestedIdValue),
    enabled: Boolean(requestedIdValue),
    refetchInterval: 8_000,
  })
  const requestedChain = useQuery({
    queryKey: queryKeys.careRequestChain(requestedIdValue),
    queryFn: () => planetApi.careRequests.chain(requestedIdValue),
    enabled: Boolean(requestedIdValue),
    refetchInterval: 8_000,
  })

  const matchesScope = useCallback((request: CareRequest) => {
    if (scope.type === 'all') return true
    if (scope.type === 'family') return request.family_id === scope.id
    return request.pet_id === scope.id && (!scope.familyId || request.family_id === scope.familyId)
  }, [scope])
  const scopedInboxRequests = useMemo(
    () => (inbox.data?.care_requests ?? []).filter(matchesScope),
    [inbox.data?.care_requests, matchesScope],
  )
  const familyNameById = useMemo(
    () => new Map((families.data?.families ?? []).map((family) => [family.id, family.name])),
    [families.data?.families],
  )
  const canRespondTo = useCallback((request: CareRequest) => {
    const pet = accessiblePets.data?.pets.find((item) => item.id === request.pet_id)
    if (!pet) return false
    if (pet.current_owner_user_id === currentUserId) return true
    const role = pet.family_roles?.[request.family_id] ??
      families.data?.families.find((family) => family.id === request.family_id)?.role
    return Boolean(role && role !== 'viewer' && role !== 'read_only')
  }, [accessiblePets.data?.pets, currentUserId, families.data?.families])

  useEffect(() => {
    let cancelled = false
    void readPendingCareActions(currentUserId).then((actions) => {
      if (cancelled) return
      pendingActionsRef.current = actions
      setPendingActions(actions)
    })
    const unsubscribe = subscribeCareActionQueue(() => {
      void readPendingCareActions(currentUserId).then((actions) => {
        if (cancelled) return
        pendingActionsRef.current = actions
        setPendingActions(actions)
      })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentUserId])

  const syncActions = useCallback(async () => {
    const current = pendingActionsRef.current
    if (syncingActionsRef.current || current.length === 0) return
    syncingActionsRef.current = true
    setSyncingActions(true)
    try {
      const result = await syncCareActionQueue(client, currentUserId)
      pendingActionsRef.current = result.remaining
      setPendingActions(result.remaining)
      if (result.remaining.length === 0 && result.synced > 0) {
        showToast({ message: `${result.synced} 条请求已同步` })
      } else if (result.remaining.length === 0 && result.discarded > 0) {
        showToast({ message: `${result.discarded} 条请求已失效，已刷新最新状态` })
      } else if (result.firstError) {
        showToast({ message: `还有 ${result.remaining.length} 条未同步：${result.firstError}` })
      }
    } catch (error) {
        showToast({ message: `请求同步失败：${errorMessage(error)}` })
    } finally {
      syncingActionsRef.current = false
      setSyncingActions(false)
    }
  }, [client, currentUserId, showToast])

  const syncActionsRef = useRef(syncActions)
  useEffect(() => {
    syncActionsRef.current = syncActions
  }, [syncActions])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncActionsRef.current()
    })
    return () => subscription.remove()
  }, [])
  useEffect(() => {
    if (
      pendingActions.length > 0 &&
      pendingActions.every((item) => item.userId === currentUserId)
    ) {
      void syncActionsRef.current()
    }
  }, [currentUserId, pendingActions.length])

  useEffect(() => {
    const pendingDecline = pendingActions.find(
      (item) => item.kind === 'decline' && item.followUp === 'reassign' && item.requestId,
    )
    if (!pendingDecline || pendingContinuation) return
    const request =
      scopedInboxRequests.find((item) => item.id === pendingDecline.requestId) ??
      (pendingDecline.requestId === requestedIdValue ? requestedRequest.data?.care_request : undefined)
    if (request) {
      setPendingContinuation({ request, commandId: pendingDecline.commandId })
      return
    }
    void planetApi.careRequests.get(pendingDecline.requestId!).then(({ care_request }) => {
      setPendingContinuation({ request: care_request, commandId: pendingDecline.commandId })
    }).catch(() => undefined)
  }, [
    scopedInboxRequests,
    pendingActions,
    pendingContinuation,
    requestedIdValue,
    requestedRequest.data?.care_request,
  ])

  useEffect(() => {
    if (!pendingContinuation) return
    let cancelled = false
    void readPendingCareActions(currentUserId).then((actions) => {
      if (cancelled || actions.some((item) => item.commandId === pendingContinuation.commandId)) return
      return planetApi.careRequests.get(pendingContinuation.request.id).then(({ care_request }) => {
        if (cancelled) return
        if (care_request.state === 'declined') {
          setComposer({ kind: 'reassign', request: care_request, currentUserId })
        } else {
      showToast({ message: '这件事已经有别的处理结果，不再重复打开' })
        }
        setPendingContinuation(null)
      })
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [currentUserId, pendingActions, pendingContinuation, showToast])

  const openedFromNotification = useRef('')
  const markedSeenRequest = useRef('')
  useEffect(() => {
    const request = requestedRequest.data?.care_request
    if (
      !detailOnly ||
      !request ||
      request.id !== requestedIdValue ||
      request.target_user_id !== currentUserId ||
      (request.state !== 'sent' && request.state !== 'seen') ||
      markedSeenRequest.current === request.id
    ) {
      return
    }
    markedSeenRequest.current = request.id
    void planetApi.careRequests.seen(request.id)
      .then(() => {
        void client.invalidateQueries({ queryKey: queryKeys.careRequestInbox })
        void client.invalidateQueries({ queryKey: ['care-requests', 'request', request.id] })
      })
      .catch(() => {
        // Reading a request must not block the detail page if acknowledgement is offline.
        markedSeenRequest.current = ''
      })
  }, [client, currentUserId, detailOnly, requestedIdValue, requestedRequest.data?.care_request])

  useEffect(() => {
    if (!requestedIdValue || (requestedAction !== 'delegate' && requestedAction !== 'handoff')) return
    const request =
      scopedInboxRequests.find((item) => item.id === requestedIdValue) ??
      requestedRequest.data?.care_request
    if (!request || !canRespondTo(request)) return
    if (requestedAction === 'handoff' && request.state !== 'accepted') return
    const key = `${requestedIdValue}:${requestedAction}`
    if (openedFromNotification.current === key) return
    openedFromNotification.current = key
    if (requestedAction === 'handoff') {
      setComposer({ kind: 'handoff', request, currentUserId })
    } else {
      setComposer({ kind: 'delegate', request, currentUserId })
    }
    router.setParams({ care_request_id: undefined, care_action: undefined })
  }, [
    canRespondTo,
    currentUserId,
    scopedInboxRequests,
    requestedAction,
    requestedIdValue,
    requestedRequest.data?.care_request,
  ])

  useEffect(() => {
    if (!requestedIdValue || requestedAction !== 'reassign') return
    const request =
      scopedInboxRequests.find((item) => item.id === requestedIdValue) ??
      requestedRequest.data?.care_request
    if (!request || request.state !== 'declined' || !canRespondTo(request)) return
    const key = `${requestedIdValue}:${requestedAction}`
    if (openedFromNotification.current === key) return
    openedFromNotification.current = key
    setComposer({ kind: 'reassign', request, currentUserId })
    router.setParams({ care_request_id: undefined, care_action: undefined })
  }, [
    canRespondTo,
    currentUserId,
    scopedInboxRequests,
    requestedAction,
    requestedIdValue,
    requestedRequest.data?.care_request,
  ])

  const respond = useMutation({
    mutationFn: ({ request, action, commandId }: { request: CareRequest; action: 'accept' | 'decline'; commandId: string }) =>
      action === 'accept'
        ? planetApi.careRequests.accept(request.id, '', commandId)
        : planetApi.careRequests.decline(request.id, '', commandId),
    onSuccess: (result, variables) => {
      invalidateAfterCareRequestChange(client)
      if (variables.action === 'accept') {
        void hapticSuccess()
        showToast({ message: '已接手这件事' })
      } else {
        showToast({ message: '选择已保存' })
        setComposer({ kind: 'reassign', request: result.care_request, currentUserId })
      }
    },
    onError: (error, variables) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: currentUserId,
          commandId: variables.commandId,
          kind: variables.action,
          requestId: variables.request.id,
          note: '',
          ...(variables.action === 'decline' ? { followUp: 'reassign' as const } : {}),
        })
          .then(() => {
            if (variables.action === 'decline') {
              setPendingContinuation({ request: variables.request, commandId: variables.commandId })
              showToast({ message: '已保存拒绝，联网后继续找人' })
            } else {
              showToast({ message: '网络暂时不可用，已保存，联网后自动回应' })
            }
          })
          .catch((saveError) => {
            showToast({ message: `离线保存失败：${errorMessage(saveError)}` })
          })
        return
      }
      showToast({ message: errorMessage(error) })
    },
  })

  const batchRequestIds = new Set(
    (batchInbox.data?.batches ?? []).flatMap((batch) => batch.requests.map((request) => request.id)),
  )
  const requests = scopedInboxRequests.filter(
    (request) => !request.batch_id || batchInbox.isError || (!batchInbox.isLoading && !batchRequestIds.has(request.id)),
  )
  const scopedSentRequests = useMemo(
    () => (sent.data?.care_requests ?? []).filter(matchesScope),
    [matchesScope, sent.data?.care_requests],
  )
  const showIncoming = view !== 'sent'
  const showOutgoing = showSent && view !== 'incoming'
  const showBatches = view !== 'sent'
  const showInboxEmpty = Boolean(
    showEmptyState &&
      showIncoming &&
      !inbox.isLoading &&
      !inbox.isError &&
      (!showSent || !sent.isError) &&
      !batchInbox.isLoading &&
      !batchInbox.isError &&
      requests.length === 0 &&
      (!showOutgoing || scopedSentRequests.length === 0) &&
      (!showBatches || (batchInbox.data?.batches.length ?? 0) === 0),
  )
  const focusedRequest = requestedRequest.data?.care_request
  const focusedPendingAction = focusedRequest
    ? pendingActions.find((item) => item.requestId === focusedRequest.id)
    : undefined
  const openOccurrence = useCallback((request: CareRequest) => {
    setScope({ type: 'pet', id: request.pet_id, familyId: request.family_id })
    const focusDate = request.due_date?.slice(0, 10) || request.due_at?.slice(0, 10)
    router.push({
      pathname: '/(tabs)',
      params: {
        family_id: request.family_id,
        pet_id: request.pet_id,
        ...(focusDate ? { focus_date: focusDate } : {}),
        focus_task_id: request.occurrence_id,
      },
    } as never)
  }, [setScope])
  const queueBar = pendingActions.length > 0 ? (
    <View style={[styles.queueBar, { backgroundColor: theme.colors.coralSoft }]}>
      <AppText variant="caption" color={theme.colors.coralDark} style={{ flex: 1 }}>
        {syncingActions ? '正在同步请求…' : `${pendingActions.length} 条请求待同步`}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="立即同步未完成的照护请求"
        onPress={() => void syncActions()}
        disabled={syncingActions}
        hitSlop={8}
      >
        <AppText variant="caption" color={theme.colors.coralDark}>立即同步</AppText>
      </Pressable>
    </View>
  ) : null
  const refreshing =
    (inbox.isFetching && !inbox.isLoading) ||
    (showSent && sent.isFetching && !sent.isLoading) ||
    (batchInbox.isFetching && !batchInbox.isLoading)
  const refreshBar = <QueryRefreshState visible={refreshing} label="正在更新照护请求" />
  const statusCard =
    focusedRequest && requestedIdValue ? (
      <CareRequestStatusCard
        request={focusedRequest}
        currentUserId={currentUserId}
        onOpenOccurrence={() => openOccurrence(focusedRequest)}
        onContinue={canRespondTo(focusedRequest) ? () => setComposer({ kind: 'reassign', request: focusedRequest, currentUserId }) : undefined}
        busy={respond.isPending || pendingActions.some((item) => item.requestId === focusedRequest.id)}
        onAccept={canRespondTo(focusedRequest) ? () => respond.mutate({ request: focusedRequest, action: 'accept', commandId: createIdempotencyKey() }) : undefined}
        onDecline={canRespondTo(focusedRequest) ? () => respond.mutate({ request: focusedRequest, action: 'decline', commandId: createIdempotencyKey() }) : undefined}
        onDelegate={canRespondTo(focusedRequest) ? () => setComposer({ kind: focusedRequest.state === 'accepted' ? 'handoff' : 'delegate', request: focusedRequest, currentUserId }) : undefined}
        readOnly={!accessiblePets.isLoading && !canRespondTo(focusedRequest)}
        pendingAction={focusedPendingAction}
        chain={requestedChain.data?.care_requests ?? []}
        chainLoading={requestedChain.isLoading}
      />
    ) : null
  const summaryCard = showSent && !detailOnly && !inbox.isLoading && !sent.isLoading ? (
    <RequestSummaryCard
      incoming={requests.length}
      sent={scopedSentRequests.length}
      batches={(batchInbox.data?.batches ?? []).length}
    />
  ) : null
  const pulseCard = showSent && !detailOnly && !inbox.isLoading && !sent.isLoading && !inbox.isError && !sent.isError ? (
    <RequestPulseCard
      incoming={requests.length}
      sent={scopedSentRequests.length}
      onOpenToday={() => router.replace(todayHref as never)}
    />
  ) : null
  if (detailOnly) {
    return (
      <>
        {queueBar}
        {refreshBar}
        {statusCard}
        {composer ? <CareRequestComposer mode={composer} onClose={() => setComposer(null)} /> : null}
      </>
    )
  }

  if (inbox.isLoading || inbox.isError || sent.isLoading || requests.length === 0) {
    return (
      <>
        {queueBar}
        {refreshBar}
        {statusCard}
        {inbox.isError ? (
          <QueryErrorState
            message="照护请求暂时无法更新"
            onRetry={() => void inbox.refetch()}
          />
        ) : null}
        {showOutgoing && sent.isError ? (
          <QueryErrorState
            message="我发出的请求暂时无法更新"
            onRetry={() => void sent.refetch()}
          />
        ) : null}
        {summaryCard}
        {pulseCard}
        {showBatches ? <CareHandoffBatchInbox currentUserId={currentUserId} /> : null}
        {showOutgoing && scopedSentRequests.length > 0 ? (
          <SentRequestSection
            requests={scopedSentRequests}
            familyNameById={familyNameById}
            currentUserId={currentUserId}
          />
        ) : null}
        {showInboxEmpty ? (
          <EmptyState
            title="现在没有待回应事项"
          description="有人把事情交给你后，事项、时间和处理按钮会出现在这里。"
            action={<Button label="回到今天" onPress={() => router.replace(todayHref as never)} />}
          />
        ) : null}
        {!showInboxEmpty && view === 'incoming' && requests.length === 0 && !inbox.isLoading && !inbox.isError ? (
          <EmptyState title="没有待你回应的事" description="切换到“我发出的”查看你已经交给其他人的事项。" />
        ) : null}
        {!showInboxEmpty && view === 'sent' && scopedSentRequests.length === 0 && !sent.isLoading && !sent.isError ? (
          <EmptyState title="还没有发出的请求" description="在今天的某件照护事项上选择“给其他人”，请求会出现在这里。" />
        ) : null}
        {composer ? <CareRequestComposer mode={composer} onClose={() => setComposer(null)} /> : null}
      </>
    )
  }

  return (
    <>
      {queueBar}
      {refreshBar}
      {statusCard}
      {summaryCard}
      {pulseCard}
      {showBatches ? <CareHandoffBatchInbox currentUserId={currentUserId} /> : null}
      {showInboxEmpty ? (
        <EmptyState
          title="现在没有需要你回应的事"
          description="新的照护请求、转交和继续安排会出现在这里。"
        />
      ) : null}
      {showIncoming ? <FadeInView>
        <Card style={styles.inboxCard}>
          <View style={styles.sectionHead}>
            <View style={[styles.iconBubble, { backgroundColor: theme.colors.coralSoft }]}>
              <Users size={18} color={theme.colors.coralDark} weight="bold" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">有人请你帮忙</AppText>
            </View>
            <AppText variant="eyebrow" color={theme.colors.coralDark}>{requests.length}</AppText>
          </View>
          <View style={{ gap: 10 }}>
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                familyName={familyNameById.get(request.family_id)}
                currentUserId={currentUserId}
                busy={respond.isPending || pendingActions.some((item) => item.requestId === request.id)}
                queued={pendingActions.some((item) => item.requestId === request.id)}
                readOnly={!accessiblePets.isLoading && !canRespondTo(request)}
                onOpen={() => router.push(`/requests/${request.id}` as never)}
                onAccept={canRespondTo(request) ? () => respond.mutate({ request, action: 'accept', commandId: createIdempotencyKey() }) : undefined}
                onDecline={canRespondTo(request) ? () => respond.mutate({ request, action: 'decline', commandId: createIdempotencyKey() }) : undefined}
                onDelegate={canRespondTo(request) ? () => setComposer({ kind: 'delegate', request, currentUserId }) : undefined}
              />
            ))}
          </View>
        </Card>
      </FadeInView> : null}
      {showOutgoing && scopedSentRequests.length > 0 ? (
        <SentRequestSection
          requests={scopedSentRequests}
          familyNameById={familyNameById}
          currentUserId={currentUserId}
        />
      ) : null}
      <CareRequestComposer mode={composer} onClose={() => setComposer(null)} />
    </>
  )
}

function RequestSummaryCard({
  incoming,
  sent,
  batches,
}: {
  incoming: number
  sent: number
  batches: number
}) {
  const { theme } = useTheme()
  return (
    <View
      style={[
        styles.summaryCard,
        
        {
          backgroundColor: theme.colors.forest2,
          borderColor: theme.colors.forest2,
          borderRadius: theme.radius.xl,
        },
      ]}
      accessible
      accessibilityLabel={`请求概览：待回应 ${incoming} 条，我发出 ${sent} 条，批量安排 ${batches} 组`}
    >
      <View style={styles.summaryIntro}>
        <AppText variant="eyebrow" color={theme.colors.mint}>照护请求</AppText>
        <AppText variant="heading" color={theme.colors.onBrand}>先处理别人交给你的事</AppText>
        <AppText variant="caption" color={theme.colors.onBrandMuted}>
          你做不了，就交给下一位成员；你发出的事会在这里跟进
        </AppText>
      </View>
      <View style={[styles.summaryStats, { borderTopColor: theme.colors.onBrandSoft }]}> 
        <RequestSummaryMetric value={incoming} label="待你回应" accent />
        <RequestSummaryMetric value={sent} label="我发出的" />
        <RequestSummaryMetric value={batches} label="批量安排" />
      </View>
    </View>
  )
}

function RequestSummaryMetric({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={styles.summaryMetric}>
      <AppText variant="title" color={accent && value > 0 ? theme.colors.onBrand : theme.colors.mint}>{value}</AppText>
      <AppText variant="caption" color={theme.colors.onBrandMuted}>{label}</AppText>
    </View>
  )
}

function RequestPulseCard({
  incoming,
  sent,
  onOpenToday,
}: {
  incoming: number
  sent: number
  onOpenToday: () => void
}) {
  const { theme } = useTheme()
  if (incoming > 0) {
    return (
      <View accessibilityLabel={`${incoming} 件照护请求等你处理`}>
        <Card
          style={[
            styles.pulseCard,
            { backgroundColor: theme.colors.coralSoft, borderColor: theme.colors.coralSoft },
          ]}
        >
          <View style={styles.pulseCopy}>
            <AppText variant="eyebrow" color={theme.colors.coralDark}>现在要处理</AppText>
            <AppText variant="heading" color={theme.colors.ink}>
              {incoming} 件照护请求等你回应
            </AppText>
            <AppText variant="caption" color={theme.colors.coralDark}>
              直接接手；这次做不了就转给其他成员。
            </AppText>
          </View>
          <View style={[styles.pulseCount, { backgroundColor: theme.colors.coralDark }]}>
            <AppText variant="title" color={theme.colors.onBrand}>{incoming}</AppText>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>待处理</AppText>
          </View>
        </Card>
      </View>
    )
  }

  if (sent > 0) {
    return (
      <View accessibilityLabel={`没有待回应请求，你发出了 ${sent} 件照护请求`}>
        <Card style={[styles.pulseCard, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.sageSoft }]}>
          <View style={styles.pulseCopy}>
            <AppText variant="eyebrow" color={theme.colors.forest2}>当前状态</AppText>
            <AppText variant="heading" color={theme.colors.ink}>没有待你回应的请求</AppText>
            <AppText variant="caption" color={theme.colors.forest2}>
              你发出的 {sent} 件照护，会在对方回应或完成后更新。
            </AppText>
          </View>
          <Button label="看今天" variant="secondary" onPress={onOpenToday} style={styles.pulseButton} />
        </Card>
      </View>
    )
  }

  return null
}

function CareRequestStatusCard({
  request,
  currentUserId,
  onOpenOccurrence,
  onContinue,
  pendingAction,
  chain,
  chainLoading,
  busy = false,
  onAccept,
  onDecline,
  onDelegate,
  readOnly = false,
}: {
  request: CareRequest
  currentUserId: string
  onOpenOccurrence?: () => void
  onContinue?: () => void
  pendingAction?: PendingCareAction
  chain: CareRequest[]
  chainLoading: boolean
  busy?: boolean
  onAccept?: () => void
  onDecline?: () => void
  onDelegate?: () => void
  readOnly?: boolean
}) {
  const { theme } = useTheme()
  const pendingCopy = pendingAction
    ? pendingAction.kind === 'accept'
      ? `已保存“${CARE_ACTION_LABELS.accept}”，联网后自动回应`
      : pendingAction.kind === 'decline'
        ? `已保存“${CARE_ACTION_LABELS.decline}”，联网后继续安排`
        : '已保存选择，联网后自动发送'
    : null
  return (
    <Card style={styles.statusCard}>
      <View style={[styles.iconBubble, { backgroundColor: theme.colors.sageSoft }]}>
        <ArrowRight size={18} color={theme.colors.forest2} weight="bold" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="label">{careRequestStatusTitle(request, currentUserId)}</AppText>
        <AppText variant="caption" color={theme.colors.forest2}>
          {pendingCopy || careRequestStatusCopy(request, currentUserId)}
        </AppText>
        {!pendingCopy && request.response_note && request.state !== 'accepted' ? (
          <AppText variant="caption" muted>
            {request.response_note}
          </AppText>
        ) : null}
        <AppText variant="caption" muted>
          {careRequestSubject(request.pet_name, request.occurrence_title)}
        </AppText>
        {onOpenOccurrence ? (
          <Button
            label="打开事项"
            variant="secondary"
            onPress={onOpenOccurrence}
            style={{ alignSelf: 'flex-start', marginTop: 2 }}
          />
        ) : null}
        {chainLoading ? (
          <AppText variant="caption" muted>正在查看之前的安排…</AppText>
        ) : chain.length > 0 ? (
          <CareRequestChain chain={chain} currentUserId={currentUserId} />
        ) : null}
        {request.state === 'declined' &&
        request.target_user_id === currentUserId &&
        !request.next_target_user_name &&
        onContinue ? (
          <Button
            label="再给其他人"
            variant="secondary"
            onPress={onContinue}
            style={{ alignSelf: 'flex-start', marginTop: 2 }}
          />
        ) : null}
        {request.target_user_id === currentUserId &&
        (request.state === 'sent' || request.state === 'seen') &&
          onAccept && onDecline && onDelegate ? (
            <View style={styles.statusActions}>
            <Button label={CARE_ACTION_LABELS.accept} busy={busy} onPress={onAccept} full />
            <View style={styles.statusSecondaryActions}>
              <Button label={CARE_ACTION_LABELS.decline} variant="secondary" busy={busy} onPress={onDecline} style={{ flex: 1 }} />
              <Button label={CARE_ACTION_LABELS.delegate} variant="ghost" busy={busy} onPress={onDelegate} style={{ flex: 1 }} />
            </View>
            </View>
        ) : null}
        {readOnly && request.target_user_id === currentUserId && (request.state === 'sent' || request.state === 'seen') ? (
          <AppText variant="caption" muted>你现在只有查看权限，不能回应这项照护请求。</AppText>
        ) : null}
        {request.occurrence_completed_by_name ? (
          <View style={{ gap: 2 }}>
            <AppText variant="caption" color={theme.colors.forest2}>
              已完成 · {request.occurrence_completed_by_user_id === currentUserId ? '你' : request.occurrence_completed_by_name}
            </AppText>
            {request.occurrence_completed_at ? (
              <AppText variant="caption" muted>
                完成时间 · {formatCareInstant(request.occurrence_completed_at, request.family_timezone, false)}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  )
}

function CareRequestChain({
  chain,
  currentUserId,
}: {
  chain: CareRequest[]
  currentUserId: string
}) {
  const { theme } = useTheme()
  const displayName = (userId: string, name: string) => (userId === currentUserId ? '你' : name)
  return (
    <View style={styles.chainBlock} accessibilityLabel={`之前怎么安排的，共 ${chain.length} 次`}>
      <AppText variant="caption" color={theme.colors.forest2}>
        之前怎么安排的 · {chain.length} 次
      </AppText>
      <View style={styles.chainList}>
        {chain.map((item, index) => {
          const current = index === chain.length - 1
          const respondedAt = item.responded_at
            ? formatCareInstant(item.responded_at, item.family_timezone, false)
            : ''
          return (
            <View key={item.id} style={styles.chainItem}>
              <View
                style={[
                  styles.chainDot,
                  { backgroundColor: current ? theme.colors.forest2 : theme.colors.lineStrong },
                ]}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="caption" color={theme.colors.forest2}>
                  {displayName(item.from_user_id, item.from_user_name)} → {displayName(item.target_user_id, item.target_user_name)}
                  {current ? ' · 当前' : ''}
                </AppText>
                <AppText variant="caption" muted>
                  {careRequestStatusCopy(item, currentUserId)}{respondedAt ? ` · ${respondedAt}` : ''}
                </AppText>
                {item.response_note ? (
                  <AppText variant="caption" muted numberOfLines={2}>
                    {item.response_note}
                  </AppText>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function SentRequestSection({
  requests,
  familyNameById,
  currentUserId,
}: {
  requests: CareRequest[]
  familyNameById: Map<string, string>
  currentUserId: string
}) {
  const { theme } = useTheme()
  const [showHistory, setShowHistory] = useState(false)
  const activeRequests = requests.filter(isActiveSentRequest)
  const historyRequests = requests.filter((request) => !isActiveSentRequest(request))
  const visibleRequests = showHistory ? requests : activeRequests
  const groups = groupSentRequests(visibleRequests)
  return (
    <FadeInView>
      <Card style={styles.inboxCard}>
        <View style={styles.sectionHead}>
          <View style={[styles.iconBubble, { backgroundColor: theme.colors.sageSoft }]}>
            <ArrowRight size={18} color={theme.colors.forest2} weight="bold" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">我发出的</AppText>
            <AppText variant="caption" muted>
              {activeRequests.length > 0 ? '正在处理的照护' : '没有正在处理的照护'}
            </AppText>
          </View>
          <AppText variant="eyebrow" color={theme.colors.forest2}>{activeRequests.length}</AppText>
        </View>
        {groups.length > 0 ? (
          <View style={{ gap: 10 }}>
            {groups.map((group) => group.batchId ? (
              <SentBatchRequestCard
                key={`batch:${group.batchId}`}
                requests={group.requests}
                batchId={group.batchId}
                familyName={familyNameById.get(group.requests[0]?.family_id ?? '')}
                currentUserId={currentUserId}
              />
            ) : (
              group.requests.map((request) => (
                <SentRequestCard
                  key={request.id}
                  request={request}
                  familyName={familyNameById.get(request.family_id)}
                  currentUserId={currentUserId}
                />
              ))
            ))}
          </View>
        ) : (
          <AppText variant="caption" muted>目前没有等待回应或正在处理的请求。</AppText>
        )}
        {historyRequests.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showHistory ? '收起已结束的请求' : `查看已结束的请求，共 ${historyRequests.length} 条`}
            accessibilityState={{ expanded: showHistory }}
            onPress={() => setShowHistory((current) => !current)}
            style={({ pressed }) => [styles.historyToggle, { borderColor: theme.colors.line, opacity: pressed ? 0.65 : 1 }]}
          >
            <AppText variant="caption" color={theme.colors.forest2}>
              {showHistory ? '收起已结束' : `查看已结束 · ${historyRequests.length}`}
            </AppText>
            <AppText variant="caption" muted>{showHistory ? '↑' : '↓'}</AppText>
          </Pressable>
        ) : null}
      </Card>
    </FadeInView>
  )
}

function isActiveSentRequest(request: CareRequest) {
  return (request.state === 'sent' || request.state === 'seen' || request.state === 'accepted') && !request.occurrence_completed_by_name
}

function groupSentRequests(requests: CareRequest[]) {
  const groups: Array<{ batchId?: string; requests: CareRequest[] }> = []
  const batchGroups = new Map<string, { batchId: string; requests: CareRequest[] }>()
  for (const request of requests) {
    if (!request.batch_id) {
      groups.push({ requests: [request] })
      continue
    }
    const existing = batchGroups.get(request.batch_id)
    if (existing) {
      existing.requests.push(request)
    } else {
      const group = { batchId: request.batch_id, requests: [request] }
      batchGroups.set(request.batch_id, group)
      groups.push(group)
    }
  }
  return groups
}

function SentBatchRequestCard({
  requests,
  batchId,
  familyName,
  currentUserId,
}: {
  requests: CareRequest[]
  batchId: string
  familyName?: string
  currentUserId: string
}) {
  const { theme } = useTheme()
  const first = requests[0]
  if (!first) return null
  const openCount = requests.filter((request) => request.state === 'sent' || request.state === 'seen').length
  const acceptedCount = requests.filter((request) => request.state === 'accepted').length
  const declinedCount = requests.filter((request) => request.state === 'declined').length
  const completedCount = requests.filter((request) => Boolean(request.occurrence_completed_by_name)).length
  const subjects = requests.slice(0, 3).map((request) => careRequestSubject(request.pet_name, request.occurrence_title))
  const remaining = requests.length - subjects.length
  return (
    <View style={[styles.sentBatch, { backgroundColor: theme.colors.paper, borderColor: theme.colors.line }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${familyName ? `${familyName} · ` : ''}你请 ${first.target_user_name} 处理 ${requests.length} 项照护，查看批量安排`}
        onPress={() => router.push(`/handoffs/${batchId}` as never)}
        style={styles.sentRequestTop}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="eyebrow" color={theme.colors.forest2}>
            {familyName ? `${familyName} · ` : ''}你请 {first.target_user_name} 处理
          </AppText>
          <AppText variant="title" numberOfLines={2}>一批照护 · {requests.length} 项</AppText>
        </View>
        <View style={styles.detailLink}>
          <AppText variant="caption" color={theme.colors.forest2}>详情</AppText>
          <ArrowRight size={15} color={theme.colors.forest2} weight="bold" />
        </View>
      </PressableScale>
      <View style={styles.batchSubjectList}>
        {subjects.map((subject, index) => <AppText key={`${subject}:${index}`} variant="caption" muted numberOfLines={1}>· {subject}</AppText>)}
        {remaining > 0 ? <AppText variant="caption" muted>还有 {remaining} 项</AppText> : null}
      </View>
      <View style={styles.sentBatchStatus} accessibilityLabel={`批量安排状态：待回应 ${openCount} 项，已接手 ${acceptedCount} 项，无法完成 ${declinedCount} 项，已完成 ${completedCount} 项`}>
        <AppText variant="caption" color={openCount > 0 ? theme.colors.coralDark : theme.colors.forest2}>待回应 {openCount}</AppText>
        <AppText variant="caption" muted>已接手 {acceptedCount}</AppText>
        <AppText variant="caption" muted>{CARE_ACTION_LABELS.decline} {declinedCount}</AppText>
        <AppText variant="caption" muted>已完成 {completedCount}</AppText>
      </View>
      <View style={styles.sentRequestFooter}>
        <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          {careRequestRouteCopy(first, currentUserId)}
        </AppText>
        <Button label="查看安排" variant="secondary" onPress={() => router.push(`/handoffs/${batchId}` as never)} style={styles.openOccurrenceButton} />
      </View>
    </View>
  )
}

function SentRequestCard({
  request,
  familyName,
  currentUserId,
}: {
  request: CareRequest
  familyName?: string
  currentUserId: string
}) {
  const { theme } = useTheme()
  const { setScope } = useScope()
  const statusColor = request.state === 'accepted' && request.occurrence_completed_by_name
    ? theme.colors.forest2
    : request.state === 'sent' || request.state === 'seen' || request.state === 'declined' || request.state === 'expired'
      ? theme.colors.coralDark
      : theme.colors.forest2
  function openOccurrence() {
    setScope({ type: 'pet', id: request.pet_id, familyId: request.family_id })
    const focusDate = request.due_date?.slice(0, 10) || request.due_at?.slice(0, 10)
    router.push({
      pathname: '/(tabs)',
      params: {
        family_id: request.family_id,
        pet_id: request.pet_id,
        ...(focusDate ? { focus_date: focusDate } : {}),
        focus_task_id: request.occurrence_id,
      },
    } as never)
  }

  return (
    <View style={[styles.sentRequest, { backgroundColor: theme.colors.paper, borderColor: theme.colors.line }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${careRequestSubject(request.pet_name, request.occurrence_title)}，${careRequestStatusCopy(request, currentUserId)}，查看请求详情`}
        onPress={() => router.push(`/requests/${request.id}` as never)}
        style={styles.sentRequestTop}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="eyebrow" color={theme.colors.forest2}>
            {familyName ? `${familyName} · ` : ''}你请 {request.target_user_name}
          </AppText>
          <AppText variant="title" numberOfLines={2}>
            {careRequestSubject(request.pet_name, request.occurrence_title)}
          </AppText>
        </View>
        <View style={styles.detailLink}>
          <AppText variant="caption" color={theme.colors.forest2}>请求</AppText>
          <ArrowRight size={15} color={theme.colors.forest2} weight="bold" />
        </View>
      </PressableScale>
      <View style={styles.metaLine}>
        <Clock size={14} color={theme.colors.soft} weight="bold" />
        <AppText variant="caption" muted>{requestDueLine(request)}</AppText>
      </View>
      <AppText variant="caption" color={statusColor}>
        {request.occurrence_completed_by_name
          ? `已完成 · ${request.occurrence_completed_by_user_id === currentUserId ? '你' : request.occurrence_completed_by_name}`
          : careRequestStatusCopy(request, currentUserId)}
      </AppText>
      <View style={styles.sentRequestFooter}>
        <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          {careRequestRouteCopy(request, currentUserId)}
        </AppText>
        <Button label="打开事项" variant="secondary" onPress={openOccurrence} style={styles.openOccurrenceButton} />
      </View>
    </View>
  )
}

function RequestCard({
  request,
  familyName,
  currentUserId,
  busy,
  queued,
  onOpen,
  onAccept,
  onDecline,
  onDelegate,
  readOnly = false,
}: {
  request: CareRequest
  familyName?: string
  currentUserId: string
  busy: boolean
  queued: boolean
  onOpen: () => void
  onAccept?: () => void
  onDecline?: () => void
  onDelegate?: () => void
  readOnly?: boolean
}) {
  const { theme } = useTheme()
  return (
    <View style={[styles.request, { backgroundColor: theme.colors.paper, borderColor: theme.colors.line }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${familyName ? `${familyName} · ` : ''}${careRequestSubject(request.pet_name, request.occurrence_title)}，查看详情`}
        onPress={onOpen}
        style={styles.requestTop}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="eyebrow" color={theme.colors.forest2}>{familyName ? `${familyName} · ` : ''}{request.from_user_name} 请你帮忙</AppText>
          <AppText variant="title">{careRequestSubject(request.pet_name, request.occurrence_title)}</AppText>
        </View>
        <View style={styles.detailLink}>
          <AppText variant="caption" color={theme.colors.forest2}>详情</AppText>
          <ArrowRight size={15} color={theme.colors.forest2} weight="bold" />
        </View>
      </PressableScale>
      <View style={styles.metaLine}>
        <Clock size={14} color={theme.colors.soft} weight="bold" />
        <AppText variant="caption" muted>{requestDueLine(request)}</AppText>
      </View>
      <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
        {careRequestRouteCopy(request, currentUserId)}
      </AppText>
      {request.message ? <AppText variant="caption" muted numberOfLines={2}>{request.message}</AppText> : null}
      {queued ? (
        <AppText variant="caption" color={theme.colors.coralDark}>已保存选择，联网后自动回复</AppText>
      ) : readOnly ? (
        <AppText variant="caption" muted>你现在只有查看权限，不能回应这项照护请求。</AppText>
      ) : onAccept && onDecline && onDelegate ? (
        <View style={styles.requestActions}>
          <Button label={CARE_ACTION_LABELS.accept} busy={busy} onPress={onAccept} full />
          <View style={styles.secondaryActions}>
            <Pressable
              disabled={busy}
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              accessibilityLabel={CARE_ACTION_LABELS.decline}
              style={({ pressed }) => [styles.decline, { borderColor: theme.colors.dangerLine, opacity: busy ? 0.5 : pressed ? 0.65 : 1 }]}
            >
              <AppText variant="label" color={theme.colors.coralDark}>{CARE_ACTION_LABELS.decline}</AppText>
            </Pressable>
            <Button label={CARE_ACTION_LABELS.delegate} variant="secondary" disabled={busy} onPress={onDelegate} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <AppText accessibilityRole="alert" variant="caption" muted>这项请求当前无法操作。</AppText>
      )}
    </View>
  )
}

export type { ComposerMode }

const styles = StyleSheet.create({
  requestContext: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 4, marginBottom: 4 },
  inboxCard: { gap: 14 },
  summaryCard: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  summaryIntro: { gap: 4 },
  summaryStats: { flexDirection: 'row', gap: 18, marginTop: 16, paddingTop: 12, paddingBottom: 15, borderTopWidth: StyleSheet.hairlineWidth },
  summaryMetric: { flex: 1, gap: 1 },
  pulseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  pulseCopy: { flex: 1, gap: 4, minWidth: 0 },
  pulseCount: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 0 },
  pulseButton: { paddingHorizontal: 13, minHeight: 44 },
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  statusActions: { gap: 8, marginTop: 6 },
  statusSecondaryActions: { flexDirection: 'row', gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  request: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 13, gap: 10 },
  sentRequest: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 13, gap: 8 },
  sentBatch: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 13, gap: 9 },
  sentRequestTop: { flexDirection: 'row', gap: 8 },
  sentRequestFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  historyToggle: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  batchSubjectList: { gap: 3 },
  sentBatchStatus: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  openOccurrenceButton: { paddingHorizontal: 11, minHeight: 44 },
  requestTop: { flexDirection: 'row', gap: 8 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  requestActions: { gap: 8 },
  secondaryActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  queueBar: { minHeight: 44, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  decline: { flex: 1, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  member: { minHeight: 58, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyMembers: { gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  chainBlock: { gap: 6, marginTop: 5 },
  chainList: { gap: 7 },
  chainItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chainDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
})
