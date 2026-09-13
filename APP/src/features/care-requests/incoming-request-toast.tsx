import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BellRinging, CaretRight, Check, X } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createIdempotencyKey, planetApi, type CareHandoffBatch, type CareRequest } from '../../core/api/planet-api'
import { errorMessage, isApiError } from '../../core/api/errors'
import { queryKeys } from '../../core/query/keys'
import { foundationReaders, invalidateAfterCareRequestChange } from '../../core/foundation'
import { useSession } from '../../core/providers/session-provider'
import { useScope } from '../../core/providers/scope-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { CARE_ACTION_LABELS } from '../../core/presentation/terminology'
import { enqueueCareAction, shouldRetryCareAction } from '../../core/storage/care-action-queue'
import { AppText } from '../../ui/components/app-text'
import { PressableScale } from '../../ui/motion'

/**
 * A request is a live handoff, not a passive inbox row. Keep one compact
 * action card mounted above the authenticated app shell so a member can
 * respond while looking at any route, including family and pet management.
 */
export function IncomingRequestToast() {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { status, userId } = useSession()
  const { setScope } = useScope()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const client = useQueryClient()
  const [incoming, setIncoming] = useState<IncomingItem | null>(null)
  const knownIds = useRef(new Set<string>())
  const initialized = useRef(false)

  const inbox = useQuery({
    queryKey: queryKeys.careRequestInbox,
    queryFn: () => planetApi.careRequests.inbox(),
    enabled: status === 'authenticated' && Boolean(userId),
    refetchInterval: 8_000,
  })
  const batchInbox = useQuery({
    queryKey: queryKeys.careHandoffInbox,
    queryFn: () => planetApi.careHandoffBatches.inbox(),
    enabled: status === 'authenticated' && Boolean(userId),
    refetchInterval: 8_000,
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
    enabled: status === 'authenticated' && Boolean(userId),
  })

  useEffect(() => {
    if (!inbox.data && !batchInbox.data) return
    // A batch also appears in the individual inbox on some older API
    // responses. The batch card is the canonical surface, so do not show the
    // same work twice.
    const openRequests = (inbox.data?.care_requests ?? []).filter(
      (request) => (request.state === 'sent' || request.state === 'seen') && !request.batch_id,
    )
    const openBatches = (batchInbox.data?.batches ?? []).filter((batch) => batch.open_count > 0)
    const openIds = new Set([
      ...openRequests.map((request) => `request:${request.id}`),
      ...openBatches.map((batch) => `batch:${batch.id}`),
    ])
    if (!initialized.current) {
      openRequests.forEach((request) => knownIds.current.add(`request:${request.id}`))
      openBatches.forEach((batch) => knownIds.current.add(`batch:${batch.id}`))
      initialized.current = true
      const unread = openRequests.find((request) => !request.seen_at)
      if (unread) setIncoming({ kind: 'request', item: unread })
      else if (openBatches[0]) setIncoming({ kind: 'batch', item: openBatches[0] })
      return
    }
    const nextRequest = openRequests.find((request) => !knownIds.current.has(`request:${request.id}`))
    const nextBatch = openBatches.find((batch) => !knownIds.current.has(`batch:${batch.id}`))
    openRequests.forEach((request) => knownIds.current.add(`request:${request.id}`))
    openBatches.forEach((batch) => knownIds.current.add(`batch:${batch.id}`))
    const next = nextRequest
      ? { kind: 'request' as const, item: nextRequest }
      : nextBatch
        ? { kind: 'batch' as const, item: nextBatch }
        : null
    if (next) setIncoming(next)
    else if (incoming && !openIds.has(incomingKey(incoming))) setIncoming(null)
  }, [batchInbox.data?.batches, inbox.data?.care_requests, incoming])

  const accept = useMutation({
    mutationFn: ({ request, commandId }: { request: CareRequest; commandId: string }) =>
      planetApi.careRequests.accept(request.id, '', commandId),
    onSuccess: (_, { request }) => {
      setIncoming(null)
      invalidateAfterCareRequestChange(client)
      showToast({ message: `已接手：${request.occurrence_title}` })
    },
    onError: (error, { request, commandId }) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: userId!,
          commandId,
          kind: 'accept',
          requestId: request.id,
          occurrenceId: request.occurrence_id,
          note: '',
        })
          .then(() => {
            setIncoming(null)
            showToast({ message: '已保存接手结果，联网后自动同步' })
          })
          .catch((saveError) => showToast({ message: `离线保存失败：${errorMessage(saveError)}` }))
        return
      }
      showToast({ message: errorMessage(error) })
      void inbox.refetch()
    },
  })

  const decline = useMutation({
    mutationFn: ({ request, commandId }: { request: CareRequest; commandId: string }) =>
      planetApi.careRequests.decline(request.id, '', commandId),
    onSuccess: (_, variables) => {
      setIncoming(null)
      invalidateAfterCareRequestChange(client)
      showToast({ message: '已标记无法完成，可以继续安排下一位' })
      router.push({
        pathname: `/requests/${variables.request.id}`,
        params: { care_action: 'reassign' },
      } as never)
    },
    onError: (error, variables) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: userId!,
          commandId: variables.commandId,
          kind: 'decline',
          requestId: variables.request.id,
          note: '',
          followUp: 'reassign',
        })
          .then(() => {
            setIncoming(null)
            showToast({ message: '已保存无法完成，联网后继续安排下一位' })
            router.push({
              pathname: `/requests/${variables.request.id}`,
              params: { care_action: 'reassign' },
            } as never)
          })
          .catch((saveError) => showToast({ message: `离线保存失败：${errorMessage(saveError)}` }))
        return
      }
      if (isApiError(error) && error.status !== 0) void inbox.refetch()
      showToast({ message: errorMessage(error) })
    },
  })

  const acceptBatch = useMutation({
    mutationFn: ({ batch, commandId }: { batch: CareHandoffBatch; commandId: string }) =>
      planetApi.careHandoffBatches.accept(batch.id, [], commandId),
    onSuccess: (_, { batch }) => {
      setIncoming(null)
      invalidateAfterCareRequestChange(client)
      showToast({ message: `已接手 ${batch.open_count} 项照护` })
    },
    onError: (error, { batch, commandId }) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: userId!,
          commandId,
          kind: 'batch-accept',
          batchId: batch.id,
          occurrenceIds: [],
        })
          .then(() => {
            setIncoming(null)
            showToast({ message: `已保存 ${batch.open_count} 项安排，联网后自动处理` })
          })
          .catch((saveError) => showToast({ message: `离线保存失败：${errorMessage(saveError)}` }))
        return
      }
      showToast({ message: errorMessage(error) })
      void batchInbox.refetch()
    },
  })

  const declineBatch = useMutation({
    mutationFn: ({ batch, commandId }: { batch: CareHandoffBatch; commandId: string }) =>
      planetApi.careHandoffBatches.decline(batch.id, [], commandId),
    onSuccess: (_, { batch }) => {
      setIncoming(null)
      invalidateAfterCareRequestChange(client)
      showToast({ message: '已标记无法完成，可以继续安排下一位' })
      router.push({
        pathname: `/handoffs/${batch.id}`,
        params: { care_batch_action: 'reassign' },
      } as never)
    },
    onError: (error, { batch, commandId }) => {
      if (shouldRetryCareAction(error)) {
        void enqueueCareAction({
          userId: userId!,
          commandId,
          kind: 'batch-decline',
          batchId: batch.id,
          occurrenceIds: [],
          followUp: 'reassign',
        })
          .then(() => {
            setIncoming(null)
            showToast({ message: '已保存无法完成，联网后继续安排下一位' })
            router.push({
              pathname: `/handoffs/${batch.id}`,
              params: { care_batch_action: 'reassign' },
            } as never)
          })
          .catch((saveError) => showToast({ message: `离线保存失败：${errorMessage(saveError)}` }))
        return
      }
      showToast({ message: errorMessage(error) })
      void batchInbox.refetch()
    },
  })

  const compact = width < 720
  const topOffset = Platform.OS === 'web' ? 20 : Math.max(14, insets.top + 10)
  const requestSyncError = inbox.isError || batchInbox.isError
  const retryRequestSync = () => {
    void Promise.all([inbox.refetch(), batchInbox.refetch()])
  }
  const syncNotice = requestSyncError ? (
    <View style={[styles.syncNotice, { backgroundColor: theme.colors.coralSoft, borderColor: theme.colors.lineStrong }]}>
      <AppText accessibilityRole="alert" variant="caption" color={theme.colors.coralDark} style={{ flex: 1 }}>
        照护请求可能没有更新
      </AppText>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="重试更新照护请求"
        onPress={retryRequestSync}
        style={[styles.syncRetry, { borderColor: theme.colors.coralDark }]}
      >
        <AppText variant="caption" color={theme.colors.coralDark}>重试</AppText>
      </PressableScale>
    </View>
  ) : null

  if (!incoming) {
    return syncNotice ? (
      <View style={[styles.host, styles.hostPointer, compact && styles.hostCompact, { top: topOffset }]}>
        {syncNotice}
      </View>
    ) : null
  }

  const openDetail = (action?: 'delegate') => {
    setIncoming(null)
    if (incoming.kind === 'batch') {
      router.push(
        action
          ? ({ pathname: `/handoffs/${incoming.item.id}`, params: { care_batch_action: action } } as never)
          : (`/handoffs/${incoming.item.id}` as never),
      )
      return
    }
    router.push(
      action
        ? ({ pathname: `/requests/${incoming.item.id}`, params: { care_action: action } } as never)
        : (`/requests/${incoming.item.id}` as never),
    )
  }

  const openCount = (inbox.data?.care_requests ?? []).filter(
    (request) => (request.state === 'sent' || request.state === 'seen') && !request.batch_id,
  ).length + (batchInbox.data?.batches ?? []).filter((batch) => batch.open_count > 0).length
  const familyName = families.data?.families.find((family) =>
    family.id === incoming.item.family_id,
  )?.name
  const dismiss = () => {
    setIncoming(null)
    if (incoming.kind === 'batch') return
    const requestId = incoming.item.id
    // Closing the prompt means the member has seen the request; it remains
    // actionable in the Requests tab and is never silently declined.
    void planetApi.careRequests.seen(requestId).then(() => {
      invalidateAfterCareRequestChange(client)
    }).catch(() => undefined)
  }
  const openInbox = () => {
    dismiss()
    setScope({ type: 'all' })
    router.push('/requests' as never)
  }

  return (
    <View style={[styles.host, styles.hostPointer, compact && styles.hostCompact, { top: topOffset }]}> 
      {syncNotice}
      <View
        style={[
          styles.card,
          theme.shadow.card,
          { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.lineStrong },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: theme.colors.coralSoft }]}>
          <BellRinging size={20} color={theme.colors.coralDark} weight="fill" />
        </View>
        <View style={styles.copy}>
          <AppText variant="eyebrow" color={theme.colors.coralDark}>有人请你帮忙</AppText>
          <AppText variant="label" numberOfLines={1}>
            {incoming.kind === 'batch'
              ? `${incoming.item.from_user_name ?? '有人'} 请你处理 ${familyName ? `${familyName} 的 ` : ''}${batchSubject(incoming.item)}`
              : `${incoming.item.from_user_name} 请你处理 ${familyName ? `${familyName} · ` : ''}${incoming.item.pet_name} 的「${incoming.item.occurrence_title}」`}
          </AppText>
          {incoming.item.message ? (
            <AppText variant="caption" muted numberOfLines={2}>{incoming.item.message}</AppText>
          ) : null}
          {openCount > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看全部 ${openCount} 条照护请求`}
              onPress={openInbox}
              hitSlop={6}
            >
              <AppText variant="caption" color={theme.colors.coralDark}>
                还有 {openCount - 1} 条待回应 · 查看全部 →
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭新照护请求提示"
          onPress={dismiss}
          style={styles.close}
        >
          <X size={16} color={theme.colors.soft} />
        </Pressable>
        <View style={[styles.actions, compact && styles.actionsCompact]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="我来做这件照护"
            disabled={accept.isPending || acceptBatch.isPending || decline.isPending || declineBatch.isPending}
            accessibilityState={{
              disabled: accept.isPending || acceptBatch.isPending || decline.isPending || declineBatch.isPending,
              busy: accept.isPending || acceptBatch.isPending,
            }}
            onPress={() => {
              if (incoming.kind === 'batch') {
                acceptBatch.mutate({ batch: incoming.item, commandId: createIdempotencyKey() })
                return
              }
              accept.mutate({ request: incoming.item, commandId: createIdempotencyKey() })
            }}
            style={[styles.primaryAction, { backgroundColor: theme.colors.forest2, opacity: accept.isPending || acceptBatch.isPending ? 0.55 : 1 }]}
          >
            <Check size={16} color={theme.colors.onBrand} weight="bold" />
            <AppText variant="caption" color={theme.colors.onBrand}>我来做</AppText>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="我也不行，继续给其他人"
            disabled={accept.isPending || acceptBatch.isPending || decline.isPending || declineBatch.isPending}
            accessibilityState={{
              disabled: accept.isPending || acceptBatch.isPending || decline.isPending || declineBatch.isPending,
              busy: decline.isPending || declineBatch.isPending,
            }}
            onPress={() => incoming.kind === 'batch'
              ? declineBatch.mutate({ batch: incoming.item, commandId: createIdempotencyKey() })
              : decline.mutate({ request: incoming.item, commandId: createIdempotencyKey() })}
            style={[styles.secondaryAction, { borderColor: theme.colors.lineStrong }]}
          >
            <AppText variant="caption" color={theme.colors.forest2}>{CARE_ACTION_LABELS.decline}</AppText>
          </PressableScale>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="查看请求详情"
            onPress={() => openDetail()}
            style={styles.openAction}
          >
            <AppText variant="caption" color={theme.colors.forest2}>查看详情</AppText>
            <CaretRight size={15} color={theme.colors.forest2} weight="bold" />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

type IncomingItem =
  | { kind: 'request'; item: CareRequest }
  | { kind: 'batch'; item: CareHandoffBatch }

function incomingKey(incoming: IncomingItem) {
  return `${incoming.kind}:${incoming.item.id}`
}

function batchSubject(batch: CareHandoffBatch) {
  const petNames = Array.from(new Set(batch.requests.map((request) => request.pet_name).filter(Boolean)))
  const petLabel = petNames.length === 0
    ? ''
    : petNames.length === 1
      ? `${petNames[0]} 的`
      : `${petNames[0]} 等 ${petNames.length} 只宠物的`
  return `${petLabel}${batch.open_count} 项照护`
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 20,
    right: 24,
    zIndex: 30,
    width: 390,
  },
  hostPointer: { pointerEvents: 'box-none' },
  syncNotice: {
    minHeight: 44,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncRetry: {
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostCompact: {
    top: 14,
    left: 14,
    right: 14,
    width: 'auto',
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 3, paddingRight: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 48 },
  actionsCompact: { paddingLeft: 0 },
  primaryAction: { minHeight: 44, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  secondaryAction: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
  openAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6 },
})
