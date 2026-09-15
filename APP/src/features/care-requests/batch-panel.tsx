import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ArrowRight, Check, Clock, Users, WarningCircle } from 'phosphor-react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createIdempotencyKey,
  planetApi,
  type CareHandoffBatch,
  type CareHandoffBatchResponse,
  type CareRequest,
  type Member,
  type Task,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { invalidateAfterCareRequestChange } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { civilDateInTimezone, formatCareCivilDate, formatCareInstant, instantFromCivilDateTime } from '../../core/time/civil'
import { CARE_ACTION_LABELS } from '../../core/presentation/terminology'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import { useSession } from '../../core/providers/session-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { TextField } from '../../ui/components/text-field'
import { PressableScale, hapticSuccess } from '../../ui/motion'
import { careRequestRouteCopy, careRequestStatusCopy, careRequestSubject } from './copy'
import {
  enqueueCareAction,
  readPendingCareActions,
  subscribeCareActionQueue,
  shouldRetryCareAction,
  type PendingCareAction,
} from '../../core/storage/care-action-queue'

function dueLine(task: Task) {
  return task.time_of_day || '时间未定'
}

function taskRiskLabel(task: Task) {
  if (task.status === 'missed') return '已逾期'
  if (task.due_at && task.status !== 'completed' && task.status !== 'skipped' && new Date(task.due_at).getTime() < Date.now()) {
    return '已到时间'
  }
  return ''
}

function requestRiskLabel(request: CareRequest) {
  if (request.occurrence_status === 'missed') return '已逾期'
  if (request.due_at && request.occurrence_status !== 'completed' && request.occurrence_status !== 'skipped' && new Date(request.due_at).getTime() < Date.now()) {
    return '需尽快处理'
  }
  return ''
}

type HandoffWindow = 'today' | 'evening' | 'custom'

function eveningBounds(timezone?: string) {
  const date = civilDateInTimezone(timezone)
  const startsAt = new Date(instantFromCivilDateTime(`${date}T18:00`, timezone))
  const endsAt = new Date(instantFromCivilDateTime(`${date}T23:59`, timezone))
  endsAt.setSeconds(59, 999)
  return { startsAt, endsAt }
}

function customBounds(timezone: string | undefined, start: string, end: string) {
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!timePattern.test(start) || !timePattern.test(end)) return null
  const date = civilDateInTimezone(timezone)
  const startsAt = new Date(instantFromCivilDateTime(`${date}T${start}`, timezone))
  const endsAt = new Date(instantFromCivilDateTime(`${date}T${end}`, timezone))
  if (endsAt.getTime() <= startsAt.getTime()) return null
  return { startsAt, endsAt }
}

function invalidateBatchQueries(client: ReturnType<typeof useQueryClient>) {
  invalidateAfterCareRequestChange(client)
}

export function CareHandoffBatchInbox({
  currentUserId,
  batchId,
  detailOnly = false,
}: {
  currentUserId: string
  batchId?: string
  detailOnly?: boolean
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { scope } = useScope()
  const { notificationActionFailure, clearNotificationActionFailure } = useSession()
  const client = useQueryClient()
  const { care_batch_id: requestedBatchId, care_batch_action: requestedBatchAction } = useLocalSearchParams<{
    care_batch_id?: string
    care_batch_action?: string
  }>()
  const requestedBatchIdValue = batchId || (typeof requestedBatchId === 'string' ? requestedBatchId : '')
  const matchingNotificationFailure = notificationActionFailure?.surface === 'batch' &&
    (!requestedBatchIdValue || notificationActionFailure.resourceId === requestedBatchIdValue)
    ? notificationActionFailure
    : null
  const notificationFailureCard = matchingNotificationFailure ? (
    <Card style={styles.notificationFailure}>
      <View style={styles.notificationFailureCopy}>
        <WarningCircle size={18} color={theme.colors.coralDark} weight="fill" />
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.coralDark} style={{ flex: 1 }}>
          {matchingNotificationFailure.message}
        </AppText>
      </View>
      <Button
        label="知道了"
        variant="secondary"
        onPress={clearNotificationActionFailure}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  ) : null
  const [selectionMode, setSelectionMode] = useState('')
  const [selectionIntent, setSelectionIntent] = useState<Record<string, 'accept' | 'delegate'>>({})
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [delegateBatch, setDelegateBatch] = useState<{ batch: CareHandoffBatch; occurrenceIds: string[]; mode: 'delegate' | 'reassign' } | null>(null)
  const [pendingContinuation, setPendingContinuation] = useState<{
    batch: CareHandoffBatch
    occurrenceIds: string[]
    commandId: string
  } | null>(null)
  const [continuationError, setContinuationError] = useState('')
  const [continuationAttempt, setContinuationAttempt] = useState(0)
  const [pendingActions, setPendingActions] = useState<PendingCareAction[]>([])
  const batches = useQuery({
    queryKey: queryKeys.careHandoffInbox,
    queryFn: () => planetApi.careHandoffBatches.inbox(),
    enabled: Boolean(currentUserId && currentUserId !== 'anonymous'),
    // IncomingRequestToast owns the shell-wide live refresh for this cache.
  })
  const requestedBatch = useQuery({
    queryKey: requestedBatchIdValue ? queryKeys.careHandoffBatch(requestedBatchIdValue) : ['care-handoff-batches', 'none'],
    queryFn: () => planetApi.careHandoffBatches.get(requestedBatchIdValue),
    enabled: Boolean(requestedBatchIdValue),
    refetchInterval: 8_000,
  })
  const accessiblePets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => planetApi.pets.listAccessible(),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })
  const canRespondTo = useCallback((request: CareRequest) => {
    const pet = accessiblePets.data?.pets.find((item) => item.id === request.pet_id)
    if (!pet) return false
    if (pet.current_owner_user_id === currentUserId) return true
    const role = pet.family_roles?.[request.family_id] ??
      families.data?.families.find((family) => family.id === request.family_id)?.role
    return Boolean(role && role !== 'viewer' && role !== 'read_only')
  }, [accessiblePets.data?.pets, currentUserId, families.data?.families])
  const permissionsReady = !accessiblePets.isLoading && !families.isLoading
  const permissionError = accessiblePets.error ?? families.error
  const scopedBatchList = useMemo(() => {
    const matchesScope = (request: CareRequest) => {
      if (scope.type === 'all') return true
      if (scope.type === 'family') return request.family_id === scope.id
      return request.pet_id === scope.id && (!scope.familyId || request.family_id === scope.familyId)
    }
    return (batches.data?.batches ?? [])
      .map((batch) => {
        const requests = batch.requests.filter(matchesScope)
        if (requests.length === 0) return null
        const openCount = requests.filter((request) => request.state === 'sent' || request.state === 'seen').length
        const acceptedCount = requests.filter((request) => request.state === 'accepted').length
        const declinedCount = requests.filter((request) => request.state === 'declined').length
        const resolvedCount = requests.filter((request) => request.state === 'cancelled' || request.state === 'expired').length
        return {
          ...batch,
          requests,
          total_count: requests.length,
          open_count: openCount,
          accepted_count: acceptedCount,
          declined_count: declinedCount,
          resolved_count: resolvedCount,
        }
      })
      .filter((batch): batch is NonNullable<typeof batch> => Boolean(batch))
  }, [batches.data?.batches, scope])
  const openedFromNotification = React.useRef('')
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void readPendingCareActions(currentUserId).then((actions) => {
        if (!cancelled) setPendingActions(actions)
      })
    }
    refresh()
    const unsubscribe = subscribeCareActionQueue(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentUserId])
  useEffect(() => {
    if (!requestedBatchIdValue || (requestedBatchAction !== 'delegate' && requestedBatchAction !== 'reassign')) return
    const batch = batches.data?.batches.find((item) => item.id === requestedBatchIdValue) ?? requestedBatch.data?.batch
    if (!batch) return
    const key = `${requestedBatchIdValue}:${requestedBatchAction}`
    if (openedFromNotification.current === key) return
    const expectedState = requestedBatchAction === 'reassign' ? 'declined' : 'open'
    const occurrenceIds = batch.requests
      .filter((request) => expectedState === 'declined'
        ? request.state === 'declined'
        : request.state === 'sent' || request.state === 'seen')
      .filter((request) => permissionsReady && canRespondTo(request))
      .map((request) => request.occurrence_id)
    if (occurrenceIds.length === 0) return
    openedFromNotification.current = key
    setDelegateBatch({
      batch,
      occurrenceIds,
      mode: requestedBatchAction === 'reassign' ? 'reassign' : 'delegate',
    })
    router.setParams({ care_batch_id: undefined, care_batch_action: undefined })
  }, [batches.data?.batches, canRespondTo, permissionsReady, requestedBatch.data?.batch, requestedBatchAction, requestedBatchIdValue])

  useEffect(() => {
    if (pendingContinuation) return
    const pendingDecline = pendingActions.find(
      (item) => item.kind === 'batch-decline' && item.followUp === 'reassign' && item.batchId,
    )
    if (!pendingDecline) {
      setContinuationError('')
      return
    }
    const batch = batches.data?.batches.find((item) => item.id === pendingDecline.batchId) ??
      (pendingDecline.batchId === requestedBatchIdValue ? requestedBatch.data?.batch : undefined)
    if (!batch) return
    const occurrenceIds = pendingDecline.occurrenceIds?.length
      ? pendingDecline.occurrenceIds
      : batch.requests
        .filter((request) => request.state === 'sent' || request.state === 'seen')
        .map((request) => request.occurrence_id)
    if (occurrenceIds.length > 0) {
      setContinuationError('')
      setPendingContinuation({ batch, occurrenceIds, commandId: pendingDecline.commandId })
    }
  }, [
    batches.data?.batches,
    pendingActions,
    pendingContinuation,
    requestedBatch.data?.batch,
    requestedBatchIdValue,
  ])

  useEffect(() => {
    if (!pendingContinuation) return
    let cancelled = false
    void readPendingCareActions(currentUserId).then((actions) => {
      if (cancelled || actions.some((item) => item.commandId === pendingContinuation.commandId)) return
      return planetApi.careHandoffBatches.get(pendingContinuation.batch.id).then(({ batch }) => {
        if (cancelled) return
        const declinedIds = batch.requests
          .filter((request) => pendingContinuation.occurrenceIds.includes(request.occurrence_id) && request.state === 'declined')
          .filter((request) => permissionsReady && canRespondTo(request))
          .map((request) => request.occurrence_id)
        if (declinedIds.length > 0) {
          setDelegateBatch({ batch, occurrenceIds: declinedIds, mode: 'reassign' })
        } else {
          showToast({ message: '这几件事已经有别的处理结果，不再重复打开' })
        }
        setContinuationError('')
        setPendingContinuation(null)
      })
    }).catch((error) => {
      if (!cancelled) setContinuationError(errorMessage(error))
    })
    return () => {
      cancelled = true
    }
  }, [canRespondTo, continuationAttempt, currentUserId, pendingActions, pendingContinuation, permissionsReady, showToast])
  const respond = useMutation({
    mutationFn: ({ batch, action, occurrenceIds, commandId }: { batch: CareHandoffBatch; action: 'accept' | 'decline'; occurrenceIds?: string[]; commandId: string }) =>
      action === 'accept'
        ? planetApi.careHandoffBatches.accept(batch.id, occurrenceIds, commandId)
        : planetApi.careHandoffBatches.decline(batch.id, occurrenceIds, commandId),
    onSuccess: (result: CareHandoffBatchResponse, variables) => {
      if (notificationActionFailure?.surface === 'batch' && notificationActionFailure.resourceId === variables.batch.id) {
        clearNotificationActionFailure()
      }
      void hapticSuccess()
      invalidateBatchQueries(client)
      setSelectionMode('')
      const changed = result.results?.filter((item) => item.outcome === 'changed').length ?? 0
      const notActionable = result.results?.filter((item) => item.outcome === 'not_actionable').length ?? 0
      if (variables.action === 'accept' && notActionable > 0) {
        showToast({ message: `已接手 ${changed} 项，另有 ${notActionable} 项需要安排` })
      } else if (variables.action === 'accept' && result.results) {
        const remaining = result.batch.open_count > 0 ? `，另有 ${result.batch.open_count} 项仍待安排` : ''
        showToast({ message: `已接手 ${changed} 项${remaining.replace('仍待安排', '还没人负责')}` })
      } else if (variables.action === 'accept') {
        const remaining = result.batch.open_count > 0 ? `，另有 ${result.batch.open_count} 项仍待安排` : ''
        showToast({ message: `已接手 ${result.batch.accepted_count} 项${remaining.replace('仍待安排', '还没人负责')}` })
      } else {
        // Only continue the items changed by this response. A batch can be
        // declined in several selections; using the final batch state here
        // would reopen older declined items and make the responsibility chain
        // look like a new request for work already handed onward.
        const declinedIds = result.results
          ?.filter((item) => item.outcome === 'changed' && item.state === 'declined')
          .map((item) => item.occurrence_id) ?? []
        if (declinedIds.length > 0) {
          setDelegateBatch({ batch: result.batch, occurrenceIds: declinedIds, mode: 'reassign' })
        } else {
          showToast({ message: '选择已保存' })
        }
      }
    },
    onMutate: (variables) => {
      if (notificationActionFailure?.surface === 'batch' && notificationActionFailure.resourceId === variables.batch.id) {
        clearNotificationActionFailure()
      }
    },
    onError: (error, variables) => {
      if (shouldRetryCareAction(error)) {
        const occurrenceIds = variables.occurrenceIds?.length
          ? variables.occurrenceIds
          : variables.batch.requests
            .filter((request) => request.state === 'sent' || request.state === 'seen')
            .filter((request) => permissionsReady && canRespondTo(request))
            .map((request) => request.occurrence_id)
        void enqueueCareAction({
          userId: currentUserId,
          commandId: variables.commandId,
          kind: variables.action === 'accept' ? 'batch-accept' : 'batch-decline',
          batchId: variables.batch.id,
          occurrenceIds,
          ...(variables.action === 'decline' ? { followUp: 'reassign' as const } : {}),
        })
          .then(() => {
            setSelectionMode('')
            if (variables.action === 'decline') {
              setPendingContinuation({ batch: variables.batch, occurrenceIds, commandId: variables.commandId })
            }
            showToast({ message: '已保存选择，联网后自动回复' })
          })
          .catch((saveError) => {
            showToast({ message: `离线保存失败：${errorMessage(saveError)}` })
          })
        return
      }
      showToast({ message: errorMessage(error) })
    },
  })

  const focusedBatch = requestedBatch.data?.batch
  const continuationRecovery = continuationError ? (
    <Card style={styles.continuationRecovery}>
      <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
        已保存批量拒绝，但暂时无法打开继续安排。{continuationError}
      </AppText>
      <Button
        label="重试打开继续安排"
        variant="secondary"
        onPress={() => {
          setContinuationError('')
          setContinuationAttempt((attempt) => attempt + 1)
        }}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  ) : null
  const retryBatchDependencies = () => {
    void Promise.all([
      batches.refetch(),
      requestedBatchIdValue ? requestedBatch.refetch() : Promise.resolve(),
      accessiblePets.refetch(),
      families.refetch(),
    ])
  }
  if (requestedBatchIdValue && requestedBatch.isError && !focusedBatch && !delegateBatch) {
    return (
      <View style={{ gap: 10 }}>
        {notificationFailureCard}
        {continuationRecovery}
        <QueryErrorState
          error={requestedBatch.error}
          message="这批照护安排暂时无法打开，请重试。"
          onRetry={retryBatchDependencies}
        />
      </View>
    )
  }
  if (permissionError && detailOnly && !focusedBatch && !delegateBatch) {
    return (
      <View style={{ gap: 10 }}>
        {notificationFailureCard}
        {continuationRecovery}
        <QueryErrorState
          error={permissionError}
          message="暂时无法确认你的照护权限，请重试后再打开这批安排。"
          onRetry={retryBatchDependencies}
        />
      </View>
    )
  }
  if (batches.isError && !focusedBatch && !delegateBatch) {
    return (
      <View style={{ gap: 10 }}>
        {notificationFailureCard}
        {continuationRecovery}
        <QueryErrorState
          message="批量照护安排暂时无法更新"
          onRetry={() => void batches.refetch()}
        />
      </View>
    )
  }
  if ((batches.isLoading && !focusedBatch) || (scopedBatchList.length === 0 && !delegateBatch && !focusedBatch)) {
    return (
      <View style={{ gap: 10 }}>
        {notificationFailureCard}
        {continuationRecovery}
        {detailOnly ? <AppText muted>正在加载这批事项…</AppText> : null}
      </View>
    )
  }
  const batchList = scopedBatchList
  const focusedOpenBatch = detailOnly
    ? batchList.find((batch) => batch.id === requestedBatchIdValue && batch.open_count > 0)
    : undefined
  const showFocusedStatus = Boolean(
    focusedBatch &&
      requestedBatchIdValue &&
      !focusedOpenBatch &&
      (detailOnly || (requestedBatchAction !== 'delegate' && requestedBatchAction !== 'reassign')),
  )
  const visibleBatchList = detailOnly
    ? (focusedOpenBatch ? [focusedOpenBatch] : [])
    : batchList

  return (
    <View style={{ gap: 10 }}>
      {notificationFailureCard}
      {continuationRecovery}
      {permissionError ? (
        <QueryErrorState
          message="成员权限暂时无法确认；当前仅展示安排，回应操作会在重试成功后恢复。"
          onRetry={retryBatchDependencies}
        />
      ) : null}
      {showFocusedStatus && focusedBatch ? (
          <CareHandoffBatchStatusCard
            batch={focusedBatch}
            currentUserId={currentUserId}
            onContinue={focusedBatch.requests.some((request) => permissionsReady && canRespondTo(request))
              ? (occurrenceIds) => setDelegateBatch({ batch: focusedBatch, occurrenceIds, mode: 'reassign' })
              : undefined}
        />
      ) : null}
      {visibleBatchList.map((batch) => {
        const openRequests = batch.requests.filter((request) => request.state === 'sent' || request.state === 'seen')
        const actionableOpenRequests = openRequests.filter((request) => permissionsReady && canRespondTo(request))
        const allOpenIds = actionableOpenRequests.map((request) => request.occurrence_id)
        const selectedIds = (selected[batch.id] ?? allOpenIds).filter((id) => allOpenIds.includes(id))
        const choosing = selectionMode === batch.id
        const intent = selectionIntent[batch.id] ?? 'accept'
        const pendingBatchAction = pendingActions.find((item) => item.batchId === batch.id)
        const hasActionableItems = actionableOpenRequests.length > 0
        return (
          <Card key={batch.id} style={styles.batchCard}>
            <View style={styles.header}>
              <View style={[styles.iconBubble, { backgroundColor: theme.colors.coralSoft }]}>
                <Users size={18} color={theme.colors.coralDark} weight="bold" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">{batch.from_user_name || '有人'} 请你帮忙做这些事</AppText>
                <AppText variant="caption" muted>一共 {batch.total_count} 件，可以全做，也可以只挑几件</AppText>
              </View>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="查看这批事项详情"
                onPress={() => router.push(`/handoffs/${batch.id}` as never)}
                style={styles.detailLink}
              >
                <AppText variant="caption" color={theme.colors.forest2}>详情</AppText>
                <ArrowRight size={15} color={theme.colors.forest2} weight="bold" />
              </PressableScale>
            </View>
            {batch.message ? <AppText variant="caption" color={theme.colors.forest2}>{batch.message}</AppText> : null}
            {pendingBatchAction ? (
              <AppText variant="caption" color={theme.colors.coralDark}>
                {pendingBatchAction.kind === 'batch-decline'
                  ? '已保存拒绝，联网后继续找人'
                  : '已保存选择，联网后自动回复'}
              </AppText>
            ) : null}
            <View style={{ gap: 7 }}>
              {batch.requests.map((request) => {
                const open = request.state === 'sent' || request.state === 'seen'
                const canRespond = permissionsReady && canRespondTo(request)
                const checked = selectedIds.includes(request.occurrence_id)
                return (
                  <Pressable
                    key={request.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: !choosing || !open || !canRespond || respond.isPending || Boolean(pendingBatchAction) }}
                    accessibilityLabel={`${careRequestSubject(request.pet_name, request.occurrence_title)}${checked ? '，已选择' : ''}${!open ? '，已处理' : !canRespond ? '，只查看' : ''}`}
                    disabled={!choosing || !open || !canRespond || respond.isPending || Boolean(pendingBatchAction)}
                    onPress={() => {
                      const next = checked
                        ? selectedIds.filter((id) => id !== request.occurrence_id)
                        : [...selectedIds, request.occurrence_id]
                      setSelected((current) => ({ ...current, [batch.id]: next }))
                    }}
                    style={[
                      styles.item,
                      {
                        borderColor: choosing && checked ? theme.colors.forest2 : theme.colors.line,
                        backgroundColor: choosing && checked ? theme.colors.sageSoft : theme.colors.paper,
                        opacity: open && canRespond ? 1 : 0.55,
                      },
                    ]}
                  >
                    {choosing ? (
                      <View style={[styles.checkbox, { borderColor: checked ? theme.colors.forest2 : theme.colors.lineStrong, backgroundColor: checked ? theme.colors.forest2 : 'transparent' }]}>
                        {checked ? <Check size={13} color={theme.colors.onBrand} weight="bold" /> : null}
                      </View>
                    ) : null}
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">{careRequestSubject(request.pet_name, request.occurrence_title)}</AppText>
                      <View style={styles.meta}>
                        <Clock size={13} color={theme.colors.soft} weight="bold" />
                        <AppText variant="caption" muted>{request.due_at ? formatCareInstant(request.due_at, batch.family_timezone || request.family_timezone, false) : formatCareCivilDate(request.due_date)}</AppText>
                        {requestRiskLabel(request) ? <AppText variant="caption" color={theme.colors.coralDark}> · {requestRiskLabel(request)}</AppText> : null}
                        {!open ? <AppText variant="caption" color={theme.colors.soft}> · {request.state === 'accepted' ? '由你负责' : '已更新'}</AppText> : !canRespond ? <AppText variant="caption" color={theme.colors.soft}> · 只查看</AppText> : null}
                      </View>
                      <AppText variant="caption" soft numberOfLines={1}>
                        {careRequestRouteCopy(request, currentUserId)}
                      </AppText>
                    </View>
                    {open && (request.occurrence_type === 'medication' || requestRiskLabel(request)) ? <WarningCircle size={17} color={theme.colors.coralDark} weight="fill" /> : null}
                  </Pressable>
                )
              })}
            </View>
            {choosing && hasActionableItems ? (
              <View style={styles.actions}>
                <Button
                  label="取消选择"
                  variant="secondary"
                  disabled={respond.isPending}
                  onPress={() => {
                    setSelectionMode('')
                    setSelectionIntent((current) => ({ ...current, [batch.id]: 'accept' }))
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label={intent === 'delegate' ? `${CARE_ACTION_LABELS.delegate} ${selectedIds.length} 项` : `${CARE_ACTION_LABELS.accept} ${selectedIds.length} 项`}
                  busy={respond.isPending}
                  disabled={selectedIds.length === 0 || Boolean(pendingBatchAction)}
                  onPress={() => {
                    if (intent === 'delegate') {
                      setDelegateBatch({ batch, occurrenceIds: selectedIds, mode: 'delegate' })
                      return
                    }
                    respond.mutate({ batch, action: 'accept', occurrenceIds: selectedIds, commandId: createIdempotencyKey() })
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}
            {!choosing && hasActionableItems ? (
              <View style={styles.requestActions}>
                <Button label={CARE_ACTION_LABELS.accept} busy={respond.isPending} disabled={Boolean(pendingBatchAction)} onPress={() => respond.mutate({ batch, action: 'accept', commandId: createIdempotencyKey() })} full />
                <View style={styles.secondaryActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={CARE_ACTION_LABELS.decline}
                    accessibilityState={{ disabled: respond.isPending || Boolean(pendingBatchAction) }}
                    disabled={respond.isPending || Boolean(pendingBatchAction)}
                    onPress={() => respond.mutate({ batch, action: 'decline', commandId: createIdempotencyKey() })}
                    style={({ pressed }) => [styles.decline, { borderColor: theme.colors.dangerLine, opacity: pressed ? 0.65 : respond.isPending ? 0.5 : 1 }]}
                  >
                    <AppText variant="label" color={theme.colors.coralDark}>{CARE_ACTION_LABELS.decline}</AppText>
                  </Pressable>
                  <Button
                    label={CARE_ACTION_LABELS.delegate}
                    variant="secondary"
                    disabled={respond.isPending || Boolean(pendingBatchAction)}
                    onPress={() => {
                      setSelectionIntent((current) => ({ ...current, [batch.id]: 'delegate' }))
                      setSelectionMode(batch.id)
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}
            {!hasActionableItems && openRequests.length > 0 ? (
              <AppText variant="caption" muted>你现在只有查看权限，不能回应这批照护请求。</AppText>
            ) : null}
          </Card>
        )
      })}
      {delegateBatch ? (
        <CareHandoffBatchDelegateComposer
          batch={delegateBatch.batch}
          occurrenceIds={delegateBatch.occurrenceIds}
          mode={delegateBatch.mode}
          currentUserId={currentUserId}
          onClose={() => setDelegateBatch(null)}
        />
      ) : null}
    </View>
  )
}

function CareHandoffBatchStatusCard({
  batch,
  currentUserId,
  onContinue,
}: {
  batch: CareHandoffBatch
  currentUserId: string
  onContinue?: (occurrenceIds: string[]) => void
}) {
  const { theme } = useTheme()
  const continuationIds = batch.requests
    .filter((request) =>
      request.state === 'declined' &&
      request.target_user_id === currentUserId &&
      !request.next_target_user_name &&
      request.occurrence_status !== 'completed' &&
      request.occurrence_status !== 'skipped',
    )
    .map((request) => request.occurrence_id)
  return (
    <Card style={styles.batchCard}>
      <View style={styles.header}>
        <View style={[styles.iconBubble, { backgroundColor: theme.colors.sageSoft }]}>
          <Check size={18} color={theme.colors.forest2} weight="bold" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">这批照护的处理情况</AppText>
          <AppText variant="caption" muted>
            {batch.from_user_name || '有人'} → {batch.target_user_name || '成员'} · 共 {batch.total_count} 项
          </AppText>
        </View>
      </View>
      {batch.message ? <AppText variant="caption" color={theme.colors.forest2}>{batch.message}</AppText> : null}
      <View style={styles.statusSummary}>
      <AppText variant="caption" color={theme.colors.forest2}>由你负责 {batch.accepted_count}</AppText>
        <AppText variant="caption" muted>待回应 {batch.open_count}</AppText>
        <AppText variant="caption" muted>{CARE_ACTION_LABELS.decline} {batch.declined_count}</AppText>
        <AppText variant="caption" muted>已结束 {batch.resolved_count}</AppText>
      </View>
      <View style={{ gap: 7 }}>
        {batch.requests.map((request) => (
          <View key={request.id} style={[styles.statusItem, { borderColor: theme.colors.line }]}>
            <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">{careRequestSubject(request.pet_name, request.occurrence_title)}</AppText>
              <AppText variant="caption" soft numberOfLines={1}>
                {careRequestRouteCopy(request, currentUserId)}
              </AppText>
              <AppText variant="caption" muted>
                {careRequestStatusCopy(request, currentUserId)}
                {request.next_target_user_name ? ` · 接下来：${request.next_target_user_name}` : ''}
              </AppText>
            </View>
            {request.occurrence_completed_by_name ? (
              <AppText variant="caption" color={theme.colors.forest2}>{request.occurrence_completed_by_name} 做完了</AppText>
            ) : null}
          </View>
        ))}
      </View>
      {continuationIds.length > 0 && onContinue ? (
        <Button
          label={`再给其他人 ${continuationIds.length} 项`}
          variant="secondary"
          onPress={() => onContinue(continuationIds)}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </Card>
  )
}

function CareHandoffBatchDelegateComposer({
  batch,
  occurrenceIds,
  mode,
  currentUserId,
  onClose,
}: {
  batch: CareHandoffBatch
  occurrenceIds: string[]
  mode: 'delegate' | 'reassign'
  currentUserId: string
  onClose: () => void
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const [targetUserId, setTargetUserId] = useState('')
  const [message, setMessage] = useState(batch.message || '')
  const family = useQuery({
    queryKey: queryKeys.family(batch.family_id),
    queryFn: () => planetApi.families.detail(batch.family_id),
    enabled: Boolean(batch.family_id),
  })
  const selectedPlanIds = useMemo(
    () => Array.from(new Set(
      batch.requests
        .filter((request) => occurrenceIds.includes(request.occurrence_id))
        .map((request) => request.care_plan_id)
        .filter((carePlanId): carePlanId is string => Boolean(carePlanId)),
    )),
    [batch.requests, occurrenceIds],
  )
  const assignmentQueries = useQueries({
    queries: selectedPlanIds.map((carePlanId) => ({
      queryKey: queryKeys.assignments(carePlanId, batch.family_id),
      queryFn: () => planetApi.carePlans.assignments(carePlanId, batch.family_id),
    })),
  })
  const selectedRequests = useMemo(
    () => batch.requests.filter((request) => occurrenceIds.includes(request.occurrence_id)),
    [batch.requests, occurrenceIds],
  )
  const selectedRequestIds = useMemo(
    () => Array.from(new Set(selectedRequests.map((request) => request.id))),
    [selectedRequests],
  )
  const chainQueries = useQueries({
    queries: selectedRequestIds.map((requestId) => ({
      queryKey: queryKeys.careRequestChain(requestId),
      queryFn: () => planetApi.careRequests.chain(requestId),
    })),
  })
  const assignmentError = assignmentQueries.find((query) => query.isError)?.error
  const chainError = chainQueries.find((query) => query.isError)?.error
  const candidateMeta = useMemo(() => {
    const meta = new Map<string, { coverage: number; bestRank: number; bestLabel: string }>()
    assignmentQueries.forEach((query) => {
      const assignments = (query.data?.assignments ?? []).slice().sort((a, b) => {
        const roleOrder = (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1)
        return roleOrder || a.priority - b.priority || a.created_at.localeCompare(b.created_at)
      })
      assignments.forEach((assignment, index) => {
        const rank = assignment.role === 'owner' ? 0 : index
        const label = assignment.role === 'owner' ? '通常由他做' : '也能帮忙'
        const current = meta.get(assignment.user_id)
        if (!current) {
          meta.set(assignment.user_id, { coverage: 1, bestRank: rank, bestLabel: label })
          return
        }
        current.coverage += 1
        if (rank < current.bestRank) {
          current.bestRank = rank
          current.bestLabel = label
        }
      })
    })
    return new Map(
      Array.from(meta.entries()).map(([userId, value]) => [
        userId,
        {
          ...value,
          label: `${value.bestLabel} · 能帮 ${value.coverage}/${selectedPlanIds.length} 件`,
        },
      ]),
    )
  }, [assignmentQueries, selectedPlanIds.length])
  const blockedOccurrenceIdsByUser = useMemo(() => {
    const blocked = new Map<string, Set<string>>()
    chainQueries.forEach((query, index) => {
      const occurrenceId = selectedRequests[index]?.occurrence_id
      if (!occurrenceId) return
      for (const request of query.data?.care_requests ?? []) {
        if (request.state !== 'declined' && request.state !== 'expired') continue
        const occurrenceIdsForUser = blocked.get(request.target_user_id) ?? new Set<string>()
        occurrenceIdsForUser.add(occurrenceId)
        blocked.set(request.target_user_id, occurrenceIdsForUser)
      }
    })
    return blocked
  }, [chainQueries, selectedRequests])
  const fullyUnavailableIds = useMemo(
    () => new Set(
      Array.from(blockedOccurrenceIdsByUser.entries())
        .filter(([, blocked]) => occurrenceIds.every((occurrenceId) => blocked.has(occurrenceId)))
        .map(([userId]) => userId),
    ),
    [blockedOccurrenceIdsByUser, occurrenceIds],
  )
  // Batch handoff has the same recipient contract as a single request:
  // viewers/read-only members may observe, but cannot receive responsibility.
  const otherMembers = useMemo(
    () => (family.data?.members ?? []).filter(
      (member) => member.user_id !== currentUserId && (member.role === 'owner' || member.role === 'caregiver'),
    ),
    [currentUserId, family.data?.members],
  )
  const viewOnlyMembers = useMemo(
    () => (family.data?.members ?? []).filter(
      (member) => member.user_id !== currentUserId && (member.role === 'viewer' || member.role === 'read_only'),
    ),
    [currentUserId, family.data?.members],
  )
  const members = useMemo(() => {
    return otherMembers
      .filter((member) => !fullyUnavailableIds.has(member.user_id))
      .sort((a, b) => {
        const aMeta = candidateMeta.get(a.user_id)
        const bMeta = candidateMeta.get(b.user_id)
        if (aMeta && !bMeta) return -1
        if (!aMeta && bMeta) return 1
        if (aMeta && bMeta) return bMeta.coverage - aMeta.coverage || aMeta.bestRank - bMeta.bestRank
        return a.display_name.localeCompare(b.display_name)
      })
  }, [candidateMeta, fullyUnavailableIds, otherMembers])
  const previouslyUnavailableMembers = otherMembers.filter((member) => fullyUnavailableIds.has(member.user_id))
  const blockedForTarget = blockedOccurrenceIdsByUser.get(targetUserId) ?? new Set<string>()
  const effectiveOccurrenceIds = occurrenceIds.filter((occurrenceId) => !blockedForTarget.has(occurrenceId))
  const chainLoading = selectedRequestIds.length > 0 && chainQueries.some((query) => query.isLoading)
  const retryAssignments = () => {
    void Promise.all(assignmentQueries.map((query) => query.refetch()))
  }
  const retryChains = () => {
    void Promise.all(chainQueries.map((query) => query.refetch()))
  }
  const delegate = useMutation({
    mutationFn: (commandId: string) => mode === 'reassign'
      ? planetApi.careHandoffBatches.reassign(batch.id, targetUserId, effectiveOccurrenceIds, message.trim(), commandId)
      : planetApi.careHandoffBatches.delegate(batch.id, targetUserId, effectiveOccurrenceIds, message.trim(), commandId),
    onSuccess: (result) => {
      void hapticSuccess()
      invalidateBatchQueries(client)
      const changed = result.results?.filter((item) => item.outcome === 'changed').length ?? occurrenceIds.length
      const blocked = result.results?.filter((item) => item.outcome === 'not_actionable' || item.outcome === 'already_resolved').length ?? 0
      if (changed === 0 && blocked > 0) {
        showToast({ message: `有 ${blocked} 项已经有别的处理结果，没有重复发出` })
      } else {
        showToast({ message: `已交给其他人 ${changed} 项${blocked > 0 ? `，另有 ${blocked} 项状态已更新` : ''}` })
      }
      onClose()
    },
    onError: (error, commandId) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: currentUserId,
          commandId,
          kind: mode === 'reassign' ? 'batch-reassign' : 'batch-delegate',
          batchId: batch.id,
          occurrenceIds: effectiveOccurrenceIds,
          targetUserId,
          message: message.trim(),
        })
          .then(() => {
          showToast({ message: '已保存安排，联网后自动发给其他人' })
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

  return (
    <ModalSheet visible onClose={onClose} busy={delegate.isPending}>
      <AppText variant="heading">{mode === 'reassign' ? '重新交给其他人' : '把这几件事交给其他人'}</AppText>
      <AppText muted style={{ marginBottom: 4 }}>
        还是刚才这些事，只安排{mode === 'reassign' ? '暂时没人能做的' : '还没有人负责的'}部分。
      </AppText>
      <View style={{ gap: 8 }}>
        {family.isLoading ? <AppText muted>正在加载家庭成员…</AppText> : null}
        {selectedPlanIds.length > 0 && assignmentQueries.some((query) => query.isLoading) ? <AppText muted>正在准备成员名单…</AppText> : null}
        {chainLoading ? <AppText muted>正在查看之前找过谁…</AppText> : null}
        {family.isError ? (
          <QueryErrorState
            embedded
            message="家庭成员暂时无法加载，不能安全地转交这些事。"
            onRetry={() => void family.refetch()}
          />
        ) : null}
        {assignmentError ? (
          <QueryErrorState
            embedded
            message="成员的常用照护安排暂时无法加载；可以继续选择成员，重试后会恢复排序提示。"
            onRetry={retryAssignments}
          />
        ) : null}
        {chainError ? (
          <QueryErrorState
            embedded
            message="之前的转交记录暂时无法加载，请重试后再继续，避免重复发起请求。"
            onRetry={retryChains}
          />
        ) : null}
        {targetUserId && blockedForTarget.size > 0 ? (
          <AppText variant="caption" color={theme.colors.coralDark}>
            {members.find((member) => member.user_id === targetUserId)?.display_name ?? '这位成员'}之前没有接手这 {blockedForTarget.size} 件事，这次不会再发给他。
          </AppText>
        ) : null}
        {members.map((member) => {
          const selected = member.user_id === targetUserId
          return (
            <PressableScale
              key={member.user_id}
              onPress={() => setTargetUserId(member.user_id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${member.display_name}${candidateMeta.get(member.user_id)?.label ? `，${candidateMeta.get(member.user_id)!.label}` : ''}${selected ? '，已选择' : ''}`}
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
                <AppText variant="caption" muted>{candidateMeta.get(member.user_id)?.label ? `${candidateMeta.get(member.user_id)!.label} · ` : ''}{member.email || '家庭成员'}</AppText>
              </View>
              {selected ? <Check size={20} color={theme.colors.forest2} weight="bold" /> : null}
            </PressableScale>
          )
        })}
        {previouslyUnavailableMembers.length > 0 ? (
          <AppText variant="caption" muted>
            这些成员之前没有接手：{previouslyUnavailableMembers.map((member) => member.display_name).join('、')}
          </AppText>
        ) : null}
        {!family.isLoading && !family.isError && members.length === 0 ? (
          <View style={styles.emptyMembers}>
            <AppText muted>
              {previouslyUnavailableMembers.length > 0
                ? '现在找不到其他人，这几件事先按原来的安排。'
                : viewOnlyMembers.length > 0
                  ? '其他成员目前只有只查看权限，不能接手照护。请邀请可参与照护的成员。'
                : '现在还没有其他成员，可以先邀请他们进来。'}
            </AppText>
            {previouslyUnavailableMembers.length === 0 ? (
              <Button
                label="邀请成员"
                variant="secondary"
                onPress={() => {
                  onClose()
                  router.push(`/families/${batch.family_id}?invite=1` as never)
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <TextField
        label="给对方留句话（选填）"
        value={message}
        onChangeText={setMessage}
        maxLength={500}
        editable={!delegate.isPending}
        multiline
        placeholder="例如：我今晚有事，你能帮我做这几件吗？"
      />
      <View style={styles.actions}>
        <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label={`发给其他人${effectiveOccurrenceIds.length > 0 ? ` ${effectiveOccurrenceIds.length} 件` : ''}`}
          busy={delegate.isPending}
          disabled={!targetUserId || members.length === 0 || effectiveOccurrenceIds.length === 0 || chainLoading || Boolean(chainError) || family.isError}
          onPress={() => delegate.mutate(createIdempotencyKey())}
          style={{ flex: 1 }}
        />
      </View>
    </ModalSheet>
  )
}

export function CareHandoffComposer({
  familyId,
  currentUserId,
  familyName,
  tasks,
  canParticipate = true,
}: {
  familyId: string
  currentUserId: string
  familyName?: string
  tasks: Task[]
  canParticipate?: boolean
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const [visible, setVisible] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [windowMode, setWindowMode] = useState<HandoffWindow>('today')
  const [customStart, setCustomStart] = useState('18:00')
  const [customEnd, setCustomEnd] = useState('23:00')
  const family = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () => planetApi.families.detail(familyId),
    enabled: visible && Boolean(familyId),
  })
  const allEligibleTasks = useMemo(() => tasks.filter((task) => task.status !== 'completed' && task.status !== 'skipped'), [tasks])
  const windowBounds = useMemo(() => {
    if (windowMode === 'evening') return eveningBounds(family.data?.family.timezone)
    if (windowMode === 'custom') return customBounds(family.data?.family.timezone, customStart, customEnd)
    return null
  }, [customEnd, customStart, family.data?.family.timezone, windowMode])
  const invalidCustomWindow = windowMode === 'custom' && !windowBounds
  const eligibleTasks = useMemo(() => {
    if (windowMode === 'custom' && !windowBounds) return []
    if (!windowBounds) return allEligibleTasks
    return allEligibleTasks.filter((task) => {
      if (!task.due_at) return false
      const dueAt = new Date(task.due_at)
      return dueAt >= windowBounds.startsAt && dueAt < windowBounds.endsAt
    })
  }, [allEligibleTasks, windowBounds, windowMode])
  useEffect(() => {
    if (visible) setSelectedIds(eligibleTasks.map((task) => task.id))
  }, [eligibleTasks, visible])
  const members = (family.data?.members ?? []).filter(
    (member) => member.user_id !== currentUserId && (member.role === 'owner' || member.role === 'caregiver'),
  )
  const viewOnlyCount = (family.data?.members ?? []).filter(
    (member) => member.user_id !== currentUserId && (member.role === 'viewer' || member.role === 'read_only'),
  ).length
  const create = useMutation({
    mutationFn: (commandId: string) => planetApi.careHandoffBatches.create(familyId, {
      target_user_id: targetUserId,
      occurrence_ids: selectedIds,
      message: message.trim(),
      ...(windowBounds ? { starts_at: windowBounds.startsAt.toISOString(), ends_at: windowBounds.endsAt.toISOString() } : {}),
    }, commandId),
    onSuccess: (result) => {
      void hapticSuccess()
      invalidateBatchQueries(client)
        showToast({ message: `已发给其他人 ${result.batch.total_count} 件事` })
      setVisible(false)
      setTargetUserId('')
      setSelectedIds([])
      setMessage('')
    },
    onError: (error, commandId) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: currentUserId,
          commandId,
          kind: 'batch-create',
          familyId,
          targetUserId,
          occurrenceIds: selectedIds,
          message: message.trim(),
          startsAt: windowBounds?.startsAt.toISOString(),
          endsAt: windowBounds?.endsAt.toISOString(),
        })
          .then(() => {
            setVisible(false)
          showToast({ message: '现在没网，先记下；联网后自动发给其他人' })
          })
          .catch((saveError) => {
            showToast({ message: `离线保存失败：${errorMessage(saveError)}` })
          })
        return
      }
      showToast({ message: errorMessage(error) })
    },
  })

  if (!canParticipate || eligibleTasks.length < 2) return null

  return (
    <>
      <PressableScale
        onPress={() => {
          setWindowMode('today')
          setSelectedIds(allEligibleTasks.map((task) => task.id))
          setVisible(true)
        }}
        accessibilityRole="button"
        accessibilityLabel={`${familyName ? `${familyName} · ` : ''}请其他人帮忙做今天的事`}
        style={[styles.shiftButton, { borderColor: theme.colors.lineStrong }]}
      >
        <Users size={17} color={theme.colors.forest2} weight="bold" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={theme.colors.forest2}>{familyName ? `${familyName} · ` : ''}请其他人帮忙做今天的事</AppText>
          <AppText variant="caption" muted>选好时间和事情，发给其他人</AppText>
        </View>
      </PressableScale>
      <ModalSheet visible={visible} onClose={() => setVisible(false)} busy={create.isPending}>
        <AppText variant="heading">{familyName ? `${familyName} · ` : ''}请其他人帮忙做几件事</AppText>
        <AppText muted style={{ marginBottom: 4 }}>先选要做的事，再选成员；对方答应后，这些事会出现在他的清单里。</AppText>
        <View style={{ gap: 7 }}>
          <AppText variant="caption" muted>选要做的事</AppText>
          <View style={styles.windowRow}>
            <PressableScale
              onPress={() => setWindowMode('today')}
              accessibilityRole="radio"
              accessibilityState={{ selected: windowMode === 'today' }}
              accessibilityLabel="今天"
              style={[styles.windowOption, { backgroundColor: windowMode === 'today' ? theme.colors.sageSoft : theme.colors.paper, borderColor: windowMode === 'today' ? theme.colors.forest2 : theme.colors.line }]}
            >
              <AppText variant="caption" color={windowMode === 'today' ? theme.colors.forest2 : theme.colors.muted}>今天</AppText>
            </PressableScale>
            <PressableScale
              onPress={() => setWindowMode('evening')}
              accessibilityRole="radio"
              accessibilityState={{ selected: windowMode === 'evening' }}
              accessibilityLabel="今晚 18:00 到 23:59"
              style={[styles.windowOption, { backgroundColor: windowMode === 'evening' ? theme.colors.sageSoft : theme.colors.paper, borderColor: windowMode === 'evening' ? theme.colors.forest2 : theme.colors.line }]}
            >
              <AppText variant="caption" color={windowMode === 'evening' ? theme.colors.forest2 : theme.colors.muted}>今晚 18:00–23:59</AppText>
            </PressableScale>
            <PressableScale
              onPress={() => setWindowMode('custom')}
              accessibilityRole="radio"
              accessibilityState={{ selected: windowMode === 'custom' }}
              accessibilityLabel="自定义时间"
              style={[styles.windowOption, { backgroundColor: windowMode === 'custom' ? theme.colors.sageSoft : theme.colors.paper, borderColor: windowMode === 'custom' ? theme.colors.forest2 : theme.colors.line }]}
            >
              <AppText variant="caption" color={windowMode === 'custom' ? theme.colors.forest2 : theme.colors.muted}>自定义</AppText>
            </PressableScale>
          </View>
          {windowMode === 'evening' ? <AppText variant="caption" color={theme.colors.forest2}>只显示今晚有具体时间的事。</AppText> : null}
          {windowMode === 'custom' ? (
            <>
              <View style={styles.customTimeRow}>
                <TextField label="开始" value={customStart} onChangeText={setCustomStart} placeholder="18:00" keyboardType="numbers-and-punctuation" maxLength={5} wrapperStyle={{ flex: 1 }} />
                <TextField label="结束" value={customEnd} onChangeText={setCustomEnd} placeholder="23:00" keyboardType="numbers-and-punctuation" maxLength={5} wrapperStyle={{ flex: 1 }} />
              </View>
              {invalidCustomWindow ? <AppText variant="caption" color={theme.colors.coralDark}>请输入有效时间，结束时间要晚于开始时间。</AppText> : <AppText variant="caption" color={theme.colors.forest2}>按家里的时区，只显示有具体时间的事。</AppText>}
            </>
          ) : null}
        </View>
        <View style={{ gap: 7 }}>
          {eligibleTasks.map((task) => {
            const checked = selectedIds.includes(task.id)
            return (
              <PressableScale
                key={task.id}
                onPress={() => setSelectedIds((current) => checked ? current.filter((id) => id !== task.id) : [...current, task.id])}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`${task.title}${checked ? '，已选择' : ''}`}
                style={[styles.item, { borderColor: checked ? theme.colors.forest2 : theme.colors.line, backgroundColor: checked ? theme.colors.sageSoft : theme.colors.paper }]}
              >
                <View style={[styles.checkbox, { borderColor: checked ? theme.colors.forest2 : theme.colors.lineStrong, backgroundColor: checked ? theme.colors.forest2 : 'transparent' }]}>
                  {checked ? <Check size={13} color={theme.colors.onBrand} weight="bold" /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{task.title}</AppText>
                  <AppText variant="caption" color={taskRiskLabel(task) ? theme.colors.coralDark : theme.colors.soft}>
                    {dueLine(task)}{taskRiskLabel(task) ? ` · ${taskRiskLabel(task)}` : ''}
                  </AppText>
                </View>
              </PressableScale>
            )
          })}
          {eligibleTasks.length === 0 ? <AppText variant="caption" muted>这段时间没有要安排的事。</AppText> : null}
        </View>
        <View style={{ gap: 8 }}>
          {members.map((member) => (
            <MemberOption key={member.user_id} member={member} selected={member.user_id === targetUserId} onPress={() => setTargetUserId(member.user_id)} />
          ))}
          {!family.isLoading && members.length === 0 ? (
            <AppText variant="caption" muted>
              {viewOnlyCount > 0
                ? '家庭里目前只有只查看成员，不能接手照护。请邀请可参与照护的成员。'
                : '还没有其他可参与照护的成员。'}
            </AppText>
          ) : null}
        </View>
        <TextField label="给对方留句话（选填）" value={message} onChangeText={setMessage} maxLength={500} multiline placeholder="例如：我今晚有事，你能帮我做这几件吗？" />
        <View style={styles.actions}>
          <Button label="取消" variant="secondary" onPress={() => setVisible(false)} style={{ flex: 1 }} />
          <Button label={`发送 ${selectedIds.length} 项`} busy={create.isPending} disabled={!targetUserId || selectedIds.length === 0 || invalidCustomWindow} onPress={() => create.mutate(createIdempotencyKey())} style={{ flex: 1 }} />
        </View>
      </ModalSheet>
    </>
  )
}

function MemberOption({ member, selected, onPress }: { member: Member; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${member.display_name}${selected ? '，已选择' : ''}`}
      style={[styles.member, { borderColor: selected ? theme.colors.forest2 : theme.colors.line, backgroundColor: selected ? theme.colors.sageSoft : theme.colors.paper }]}
    >
      <View style={[styles.avatar, { backgroundColor: selected ? theme.colors.forest2 : theme.colors.sageSoft }]}>
        <AppText variant="label" color={selected ? theme.colors.onBrand : theme.colors.forest2}>{member.display_name.slice(0, 1).toUpperCase()}</AppText>
      </View>
      <AppText variant="label" style={{ flex: 1 }}>{member.display_name}</AppText>
      {selected ? <Check size={18} color={theme.colors.forest2} weight="bold" /> : null}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  batchCard: { gap: 12 },
  continuationRecovery: { gap: 10 },
  notificationFailure: { gap: 10, padding: 13 },
  notificationFailureCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2 },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  item: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  requestActions: { gap: 8 },
  secondaryActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  decline: { flex: 1, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  delegateLink: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 8 },
  shiftButton: { minHeight: 58, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  windowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  windowOption: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  customTimeRow: { flexDirection: 'row', gap: 8 },
  member: { minHeight: 54, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  emptyMembers: { gap: 10 },
  statusSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusItem: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
})
