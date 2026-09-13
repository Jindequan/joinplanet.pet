import type { QueryClient } from '@tanstack/react-query'
import { planetApi } from '../api/planet-api'
import { errorMessage, isApiError } from '../api/errors'
import { publishCareLiveSync } from '../collaboration/live-sync'
import { kvGetJSON, kvRemove, kvSetJSONDurable } from './kv'

/** A Pet Event is a user fact; keep it locally until the server confirms it. */
export type PendingTimelineEvent = {
  userId: string
  commandId: string
  petId: string
  familyId?: string
  type: string
  occurredAt: string
  payload: Record<string, unknown>
  lastError?: string
}

const listeners = new Set<() => void>()
const queueLocks = new Map<string, Promise<unknown>>()
const syncLocks = new Map<string, Promise<SyncPendingTimelineEventsResult>>()

function storageKey(userId: string) {
  return `planet.pending.timeline-events.${userId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isPendingTimelineEvent(value: unknown): value is PendingTimelineEvent {
  if (!isRecord(value)) return false
  return (
    typeof value.userId === 'string' &&
    typeof value.commandId === 'string' &&
    typeof value.petId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.occurredAt === 'string' &&
    isRecord(value.payload)
  )
}

export async function readPendingTimelineEvents(userId: string): Promise<PendingTimelineEvent[]> {
  const value = await kvGetJSON<unknown>(storageKey(userId))
  if (!Array.isArray(value)) return []
  return value.filter(isPendingTimelineEvent).map((item) => ({ ...item, userId }))
}

async function writePendingTimelineEvents(userId: string, events: PendingTimelineEvent[]) {
  await kvSetJSONDurable(storageKey(userId), events)
  for (const listener of listeners) listener()
}

export function subscribePendingTimelineEvents(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function enqueueTimelineEvent(event: PendingTimelineEvent) {
  const previous = queueLocks.get(event.userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = await readPendingTimelineEvents(event.userId)
    if (current.some((item) => item.commandId === event.commandId)) return
    await writePendingTimelineEvents(event.userId, [...current, event])
  })
  queueLocks.set(event.userId, currentRun)
  try {
    await currentRun
  } finally {
    if (queueLocks.get(event.userId) === currentRun) queueLocks.delete(event.userId)
  }
}

/**
 * Merge one replay attempt without deleting events enqueued while the network
 * requests were in flight. The queue lock serializes this commit with a
 * concurrent enqueue, while command IDs distinguish the attempted snapshot
 * from new local events.
 */
export async function commitTimelineSync(
  userId: string,
  attempted: PendingTimelineEvent[],
  remaining: PendingTimelineEvent[],
) {
  const previous = queueLocks.get(userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = await readPendingTimelineEvents(userId)
    const remainingById = new Map(remaining.map((item) => [item.commandId, item]))
    const attemptedIds = new Set(attempted.map((item) => item.commandId))
    const merged = current
      .filter((item) => !attemptedIds.has(item.commandId) || remainingById.has(item.commandId))
      .map((item) => remainingById.get(item.commandId) ?? item)
    await writePendingTimelineEvents(userId, merged)
    return merged
  })
  queueLocks.set(userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (queueLocks.get(userId) === currentRun) queueLocks.delete(userId)
  }
}

export async function clearPendingTimelineEvents(userId: string) {
  await syncLocks.get(userId)?.catch(() => undefined)
  await queueLocks.get(userId)?.catch(() => undefined)
  await kvRemove(storageKey(userId))
  for (const listener of listeners) listener()
}

export function shouldRetryTimelineEvent(error: unknown) {
  if (!isApiError(error)) return true
  return error.status === 0 || error.status === 401 || error.status >= 500
}

export type SyncPendingTimelineEventsResult = {
  remaining: PendingTimelineEvent[]
  synced: number
  discarded: number
  firstError: string
}

async function syncPendingTimelineEventsOnce(
  client: QueryClient,
  pending: PendingTimelineEvent[],
): Promise<SyncPendingTimelineEventsResult> {
  const remaining: PendingTimelineEvent[] = []
  let synced = 0
  let discarded = 0
  let firstError = ''
  for (const [index, event] of pending.entries()) {
    try {
      await planetApi.pets.createEvent(
        event.petId,
        {
          ...(event.familyId ? { family_id: event.familyId } : {}),
          type: event.type,
          occurred_at: event.occurredAt,
          payload: event.payload,
        },
        event.commandId,
      )
      synced += 1
      publishCareLiveSync({ kind: 'timeline' })
      void client.invalidateQueries({ queryKey: ['timeline'] })
      void client.invalidateQueries({ queryKey: ['pet', event.petId] })
    } catch (error) {
      const message = errorMessage(error)
      firstError ||= message
      if (shouldRetryTimelineEvent(error)) {
        remaining.push({ ...event, lastError: message })
        // Preserve record order: a later fact must not appear before an
        // earlier one that the server has not confirmed yet.
        remaining.push(...pending.slice(index + 1))
        break
      }
      discarded += 1
    }
  }
  return { remaining, synced, discarded, firstError }
}

/** Replay one user's queued Pet Events serially after login or foreground. */
export async function syncPendingTimelineEvents(
  client: QueryClient,
  userId: string,
): Promise<SyncPendingTimelineEventsResult> {
  const previous = syncLocks.get(userId) ?? Promise.resolve({
    remaining: [],
    synced: 0,
    discarded: 0,
    firstError: '',
  })
  const currentRun = previous.catch(() => undefined).then(async () => {
    const pending = await readPendingTimelineEvents(userId)
    if (pending.length === 0) return { remaining: [], synced: 0, discarded: 0, firstError: '' }
    const result = await syncPendingTimelineEventsOnce(client, pending)
    const merged = await commitTimelineSync(userId, pending, result.remaining)
    return { ...result, remaining: merged }
  })
  syncLocks.set(userId, currentRun)
  try {
    return await currentRun
  } finally {
    if (syncLocks.get(userId) === currentRun) syncLocks.delete(userId)
  }
}
