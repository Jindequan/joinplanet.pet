import type { QueryClient } from '@tanstack/react-query'
import { errorMessage, isApiError } from '../api/errors'
import { kvGetJSON, kvRemove, kvSetJSONDurable } from '../storage/kv'
import { createFoundationWriters } from './writers'

const listeners = new Set<() => void>()
const queueLocks = new Map<string, Promise<unknown>>()

/** Wait until the current user's completion/skip queue is no longer writing. */
export async function waitForPendingCareTaskQueue(userId: string) {
  await queueLocks.get(userId)?.catch(() => undefined)
}

/** Remove a deleted account's durable completion facts from this device. */
export async function clearPendingCareTaskQueue(userId: string) {
  await waitForPendingCareTaskQueue(userId)
  await kvRemove(storageKey(userId))
  for (const listener of listeners) listener()
}

export type PendingCareTask = {
  userId: string
  taskId: string
  action?: 'complete' | 'undo'
  status?: 'done' | 'skipped'
  date?: string
  note?: string
  logId?: string
  commandId: string
  lastError?: string
}

function storageKey(userId: string) {
  return `planet.pending.today.${userId}`
}

function isPendingTask(item: unknown): item is PendingCareTask {
  if (!item || typeof item !== 'object') return false
  const record = item as PendingCareTask
  const action = record.action ?? 'complete'
  return (
    typeof record.taskId === 'string' &&
    (action === 'undo'
      ? typeof record.logId === 'string' && record.logId.length > 0
      : action === 'complete' &&
        (record.status === 'done' || record.status === 'skipped') &&
        typeof record.date === 'string') &&
    typeof record.commandId === 'string'
  )
}

export async function readPendingCareTasks(userId: string): Promise<PendingCareTask[]> {
  const value = await kvGetJSON<unknown>(storageKey(userId))
  if (!Array.isArray(value)) return []
  return value.filter(isPendingTask).map((item) => ({ ...item, userId }))
}

export async function writePendingCareTasks(userId: string, pending: PendingCareTask[]) {
  // Completion/skip is a user fact, not a cache. Never fall back to process
  // memory here: a restart must not make an offline completion disappear.
  await kvSetJSONDurable(storageKey(userId), pending)
  for (const listener of listeners) listener()
}

export function subscribePendingCareTasks(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function enqueuePendingCareTask(item: PendingCareTask) {
  const previous = queueLocks.get(item.userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = await readPendingCareTasks(item.userId)
    if (current.some((candidate) => candidate.commandId === item.commandId)) return current
    const next = [...current, item]
    await writePendingCareTasks(item.userId, next)
    return next
  })
  queueLocks.set(item.userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (queueLocks.get(item.userId) === currentRun) queueLocks.delete(item.userId)
  }
}

/** Persist an undo intent when the completion log cannot be reached. */
export async function enqueuePendingCareUndo(item: {
  userId: string
  taskId: string
  logId: string
  commandId: string
}) {
  return enqueuePendingCareTask({ ...item, action: 'undo' })
}

/** Cancel a local completion/skip intent before it reaches the server. */
export async function discardPendingCareTasks(userId: string, taskId: string) {
  const previous = queueLocks.get(userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = await readPendingCareTasks(userId)
    const pending = current.filter((item) => item.taskId !== taskId)
    const removed = pending.length !== current.length
    if (removed) await writePendingCareTasks(userId, pending)
    return { pending, removed }
  })
  queueLocks.set(userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (queueLocks.get(userId) === currentRun) queueLocks.delete(userId)
  }
}

export type SyncPendingResult = {
  remaining: PendingCareTask[]
  synced: number
  discarded: number
  firstError: string
}

function shouldRetryPendingCareTask(error: unknown) {
  if (!isApiError(error)) return true
  // A session expiry is recoverable after sign-in. Explicit business 4xx
  // responses (deleted/archived/invalid occurrences) are not retryable.
  return error.status === 0 || error.status === 401 || error.status >= 500
}

/** 离线队列同步 — 走 foundation Writers，保证 invalidate 与线上一致 */
export async function syncPendingCareTasks(
  client: QueryClient,
  pending: PendingCareTask[],
): Promise<SyncPendingResult> {
  const writers = createFoundationWriters(client)
  const remaining: PendingCareTask[] = []
  let synced = 0
  let discarded = 0
  let firstError = ''
  for (const [index, item] of pending.entries()) {
    try {
      if (item.action === 'undo') {
        await writers.undoCare(item.logId!, item.commandId)
      } else {
        await writers.completeCare({
          taskId: item.taskId,
          status: item.status!,
          date: item.date!,
          note: item.note ?? '',
          idempotencyKey: item.commandId,
        })
      }
      synced += 1
    } catch (error) {
      if (isApiError(error) && error.code === 'TASK_LOG_EXISTS') {
        synced += 1
        continue
      }
      const message = errorMessage(error)
      firstError ||= message
      if (shouldRetryPendingCareTask(error)) {
        remaining.push({ ...item, lastError: message })
        // Once the transport/session is unavailable, keep later actions in
        // order without hammering the server with requests that cannot work.
        remaining.push(...pending.slice(index + 1))
        break
      }
      discarded += 1
    }
  }
  return { remaining, synced, discarded, firstError }
}

/**
 * Replay the durable completion queue from the authenticated shell. The
 * Today screen may also request a manual retry; the per-user lock prevents
 * either path from overwriting the other's result.
 */
export async function syncPendingCareTaskQueue(
  client: QueryClient,
  userId: string,
): Promise<SyncPendingResult> {
  const previous = queueLocks.get(userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const pending = await readPendingCareTasks(userId)
    if (pending.length === 0) return { remaining: [], synced: 0, discarded: 0, firstError: '' }
    const result = await syncPendingCareTasks(client, pending)
    await writePendingCareTasks(userId, result.remaining)
    return result
  })
  queueLocks.set(userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (queueLocks.get(userId) === currentRun) queueLocks.delete(userId)
  }
}
