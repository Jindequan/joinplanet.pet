import type { Today } from '../api/planet-api'
import { kvGetJSON, kvRemove, kvRemoveWebPersistentPrefix, kvSetJSON } from './kv'

export type TodaySnapshot = {
  savedAt: string
  today: Today
}

function scopeKey(query: { date?: string; family_id?: string; pet_id?: string }) {
  return [query.date ?? 'current', query.family_id ?? 'all-families', query.pet_id ?? 'all-pets']
    .map((value) => encodeURIComponent(value))
    .join(':')
}

function storeKey(userId: string) {
  return `planet.offline.today.v2.${encodeURIComponent(userId)}`
}

function legacySnapshotKey(userId: string, query: { date?: string; family_id?: string; pet_id?: string }) {
  return `planet.offline.today.v1.${encodeURIComponent(userId)}.${scopeKey(query)}`
}

function legacyPrefix(userId: string) {
  return `planet.offline.today.v1.${encodeURIComponent(userId)}.`
}

type SnapshotStore = Record<string, TodaySnapshot>
const writeLocks = new Map<string, Promise<void>>()

function asSnapshotStore(value: unknown): SnapshotStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as SnapshotStore
}

export async function readTodaySnapshot(
  userId: string,
  query: { date?: string; family_id?: string; pet_id?: string },
) {
  const store = asSnapshotStore(await kvGetJSON<unknown>(storeKey(userId)))
  const cached = store[scopeKey(query)]
  if (cached) return cached

  // Read once from the pre-v2 layout and migrate the entry so upgrades do not
  // strand a user's last offline list. Web cleanup is handled on account
  // deletion; native SecureStore has no key enumeration API.
  const legacy = await kvGetJSON<TodaySnapshot>(legacySnapshotKey(userId, query))
  if (legacy) {
    void writeTodaySnapshot(userId, query, legacy.today)
    void kvRemove(legacySnapshotKey(userId, query))
  }
  return legacy ?? null
}

export async function writeTodaySnapshot(
  userId: string,
  query: { date?: string; family_id?: string; pet_id?: string },
  today: Today,
) {
  const previous = writeLocks.get(userId) ?? Promise.resolve()
  const currentRun = previous.catch(() => undefined).then(async () => {
    const current = asSnapshotStore(await kvGetJSON<unknown>(storeKey(userId)))
    current[scopeKey(query)] = { savedAt: new Date().toISOString(), today }
    const entries = Object.entries(current)
      .sort(([, left], [, right]) => left.savedAt.localeCompare(right.savedAt))
      .slice(-24)
    await kvSetJSON(storeKey(userId), Object.fromEntries(entries))
  })
  writeLocks.set(userId, currentRun)
  try {
    await currentRun
  } finally {
    if (writeLocks.get(userId) === currentRun) writeLocks.delete(userId)
  }
}

/** Remove all cached Today snapshots for a deleted account. */
export async function clearTodaySnapshots(userId: string) {
  await writeLocks.get(userId)?.catch(() => undefined)
  await kvRemove(storeKey(userId))
  kvRemoveWebPersistentPrefix(legacyPrefix(userId))
}
