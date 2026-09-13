import type { QueryClient } from '@tanstack/react-query'
import { createIdempotencyKey, planetApi } from '../api/planet-api'
import { errorMessage, isApiError } from '../api/errors'
import { publishCareLiveSync } from '../collaboration/live-sync'
import { kvGetJSON, kvRemove, kvSetJSONDurable } from './kv'

export type PendingCareActionKind =
  | 'create'
  | 'handoff'
  | 'claim'
  | 'accept'
  | 'decline'
  | 'delegate'
  | 'reassign'
  | 'batch-create'
  | 'batch-accept'
  | 'batch-decline'
  | 'batch-delegate'
  | 'batch-reassign'

export type PendingCareAction = {
  userId: string
  commandId: string
  kind: PendingCareActionKind
  occurrenceId?: string
  requestId?: string
  familyId?: string
  batchId?: string
  occurrenceIds?: string[]
  targetUserId?: string
  message?: string
  note?: string
  followUp?: 'reassign'
  startsAt?: string
  endsAt?: string
  lastError?: string
}

const listeners = new Set<() => void>()
const queueLocks = new Map<string, Promise<unknown>>()
const syncLocks = new Map<string, Promise<SyncPendingCareActionsResult>>()

/** Wait until the current user's care-action replay has finished. */
export async function waitForCareActionQueue(userId: string) {
  await syncLocks.get(userId)?.catch(() => undefined)
  await queueLocks.get(userId)?.catch(() => undefined)
}

/** Remove a deleted account's durable care-action commands from this device. */
export async function clearCareActionQueue(userId: string) {
  await waitForCareActionQueue(userId)
  await kvRemove(storageKey(userId))
  for (const listener of listeners) listener()
}

function storageKey(userId: string) {
  return `planet.pending.care-actions.${userId}`
}

function isPendingCareAction(value: unknown): value is PendingCareAction {
  if (!value || typeof value !== 'object') return false
  const item = value as PendingCareAction
  return (
    typeof item.commandId === 'string' &&
    typeof item.userId === 'string' &&
    ['create', 'handoff', 'claim', 'accept', 'decline', 'delegate', 'reassign', 'batch-create', 'batch-accept', 'batch-decline', 'batch-delegate', 'batch-reassign'].includes(item.kind)
  )
}

export async function readPendingCareActions(userId: string): Promise<PendingCareAction[]> {
  const value = await kvGetJSON<unknown>(storageKey(userId))
  if (!Array.isArray(value)) return []
  return value.filter(isPendingCareAction).map((item) => ({ ...item, userId }))
}

export async function writePendingCareActions(userId: string, actions: PendingCareAction[]) {
  await kvSetJSONDurable(storageKey(userId), actions)
  for (const listener of listeners) listener()
}

export async function enqueueCareAction(action: PendingCareAction) {
  const previous = queueLocks.get(action.userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = await readPendingCareActions(action.userId)
    if (!current.some((item) => item.commandId === action.commandId)) {
      await writePendingCareActions(action.userId, [...current, action])
    }
  })
  queueLocks.set(action.userId, currentRun)
  try {
    await currentRun
  } finally {
    if (queueLocks.get(action.userId) === currentRun) queueLocks.delete(action.userId)
  }
}

/** 合并一次同步结果，只删除本次尝试的 commandId，不覆盖同步期间新加入的动作。 */
export async function commitCareActionSync(
  userId: string,
  attempted: PendingCareAction[],
  remaining: PendingCareAction[],
) {
  const previous = queueLocks.get(userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = await readPendingCareActions(userId)
    const remainingById = new Map(remaining.map((item) => [item.commandId, item]))
    const attemptedIds = new Set(attempted.map((item) => item.commandId))
    const merged = current
      .filter((item) => !attemptedIds.has(item.commandId) || remainingById.has(item.commandId))
      .map((item) => remainingById.get(item.commandId) ?? item)
    await writePendingCareActions(userId, merged)
    return merged
  })
  queueLocks.set(userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (queueLocks.get(userId) === currentRun) queueLocks.delete(userId)
  }
}

export function subscribeCareActionQueue(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function shouldRetryCareAction(error: unknown) {
  if (!isApiError(error)) return true
  // 401 means the session may have expired, not that the user's action is
  // invalid. Keep the original commandId so it can replay after sign-in.
  // 403/404/409 are authoritative business outcomes and are discarded.
  return error.status === 0 || error.status === 401 || error.status >= 500
}

async function sendCareAction(action: PendingCareAction) {
  switch (action.kind) {
    case 'create':
    case 'handoff':
      if (!action.occurrenceId || !action.familyId || !action.targetUserId) throw new Error('照护请求信息不完整')
      return planetApi.careRequests.create(
        action.occurrenceId,
        { family_id: action.familyId, target_user_id: action.targetUserId, message: action.message },
        action.commandId,
      )
    case 'claim':
      if (!action.occurrenceId || !action.familyId) throw new Error('照护事项信息不完整')
      return planetApi.careRequests.claim(action.familyId, action.occurrenceId, action.commandId)
    case 'accept':
      if (!action.requestId) throw new Error('照护请求信息不完整')
      return planetApi.careRequests.accept(action.requestId, action.note ?? '', action.commandId)
    case 'decline':
      if (!action.requestId) throw new Error('照护请求信息不完整')
      return planetApi.careRequests.decline(action.requestId, action.note ?? '', action.commandId)
    case 'delegate':
      if (!action.requestId || !action.targetUserId) throw new Error('照护请求信息不完整')
      return planetApi.careRequests.delegate(
        action.requestId,
        { target_user_id: action.targetUserId, message: action.message },
        action.commandId,
      )
    case 'reassign':
      if (!action.requestId || !action.targetUserId) throw new Error('照护请求信息不完整')
      return planetApi.careRequests.reassign(
        action.requestId,
        { target_user_id: action.targetUserId, message: action.message },
        action.commandId,
      )
    case 'batch-create':
      if (!action.familyId || !action.targetUserId || !action.occurrenceIds?.length) throw new Error('照护安排信息不完整')
      return planetApi.careHandoffBatches.create(
        action.familyId,
        {
          target_user_id: action.targetUserId,
          occurrence_ids: action.occurrenceIds,
          message: action.message,
          ...(action.startsAt && action.endsAt ? { starts_at: action.startsAt, ends_at: action.endsAt } : {}),
        },
        action.commandId,
      )
    case 'batch-accept':
      if (!action.batchId) throw new Error('照护安排信息不完整')
      return planetApi.careHandoffBatches.accept(action.batchId, action.occurrenceIds, action.commandId)
    case 'batch-decline':
      if (!action.batchId) throw new Error('照护安排信息不完整')
      return planetApi.careHandoffBatches.decline(action.batchId, action.occurrenceIds, action.commandId)
    case 'batch-delegate':
      if (!action.batchId || !action.targetUserId) throw new Error('照护安排信息不完整')
      return planetApi.careHandoffBatches.delegate(
        action.batchId,
        action.targetUserId,
        action.occurrenceIds,
        action.message,
        action.commandId,
      )
    case 'batch-reassign':
      if (!action.batchId || !action.targetUserId) throw new Error('照护安排信息不完整')
      return planetApi.careHandoffBatches.reassign(
        action.batchId,
        action.targetUserId,
        action.occurrenceIds,
        action.message,
        action.commandId,
      )
  }
}

export type SyncPendingCareActionsResult = {
  remaining: PendingCareAction[]
  synced: number
  discarded: number
  firstError: string
}

/**
 * 责任转接离线同步：按用户操作顺序重放，服务端幂等键保证重试不会重复转接。
 * 网络/401/5xx 错误保留队列；明确的业务 4xx 说明行动卡已失效，移出队列并交给 UI 提示。
 */
export async function syncPendingCareActions(
  client: QueryClient,
  pending: PendingCareAction[],
): Promise<SyncPendingCareActionsResult> {
  const remaining: PendingCareAction[] = []
  let synced = 0
  let discarded = 0
  let firstError = ''
  for (const [index, item] of pending.entries()) {
    try {
      await sendCareAction(item)
      synced += 1
      publishCareLiveSync({
        kind: item.kind.includes('batch') ? 'care-request' : 'care-action',
        ...(item.requestId ? { requestId: item.requestId } : {}),
      })
      void client.invalidateQueries({ queryKey: ['care-requests', 'inbox'] })
      if (item.requestId) {
        void client.invalidateQueries({ queryKey: ['care-requests', 'request', item.requestId] })
        void client.invalidateQueries({ queryKey: ['care-requests', 'chain', item.requestId] })
      }
      if (item.batchId || item.kind === 'batch-create') {
        void client.invalidateQueries({ queryKey: ['care-handoff-batches', 'inbox'] })
        if (item.batchId) {
          void client.invalidateQueries({ queryKey: ['care-handoff-batches', item.batchId] })
        }
      }
      void client.invalidateQueries({ queryKey: ['today'] })
    } catch (error) {
      const message = errorMessage(error)
      firstError ||= message
      if (shouldRetryCareAction(error)) {
        remaining.push({ ...item, lastError: message })
        // Preserve the user's responsibility order. If the first command
        // cannot be confirmed, later commands may depend on its committed
        // state (for example decline before reassign) and must not leapfrog
        // it just because their request happened to reach the server.
        remaining.push(...pending.slice(index + 1))
        break
      } else {
        discarded += 1
      }
    }
  }
  return { remaining, synced, discarded, firstError }
}

/**
 * Replay and commit one user's queue as one serialized run. The authenticated
 * shell and individual care screens may both request a sync, but they must
 * never send the same command concurrently.
 */
export async function syncCareActionQueue(
  client: QueryClient,
  userId: string,
): Promise<SyncPendingCareActionsResult> {
  const previous = syncLocks.get(userId) ?? Promise.resolve({
    remaining: [],
    synced: 0,
    discarded: 0,
    firstError: '',
  })
  const currentRun = previous.catch(() => undefined).then(async () => {
    const pending = await readPendingCareActions(userId)
    if (pending.length === 0) {
      return { remaining: [], synced: 0, discarded: 0, firstError: '' }
    }
    const result = await syncPendingCareActions(client, pending)
    const remaining = await commitCareActionSync(userId, pending, result.remaining)
    return { ...result, remaining }
  })
  syncLocks.set(userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (syncLocks.get(userId) === currentRun) syncLocks.delete(userId)
  }
}

export function newCareAction(kind: PendingCareActionKind, userId: string): PendingCareAction {
  return { userId, kind, commandId: createIdempotencyKey() }
}
