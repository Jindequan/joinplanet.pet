import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const memory = new Map<string, string>()

// iOS SecureStore has a practical value limit of about 2 KB. Today snapshots
// and offline command queues are deliberately durable, so writing them as one
// JSON value eventually produces a warning today and can throw in a future
// SDK. Keep the same encrypted store, but split larger values into small
// records and publish the chunk count last.
const SECURE_CHUNK_SIZE = 480
const SECURE_CHUNK_META_SUFFIX = '.__planet_chunk_count'

function chunkMetaKey(key: string) {
  return `${key}${SECURE_CHUNK_META_SUFFIX}`
}

function chunkKey(key: string, index: number) {
  return `${key}.__planet_chunk_${index}`
}

async function readSecureValue(key: string): Promise<string | null> {
  const metaKey = chunkMetaKey(key)
  const meta = await SecureStore.getItemAsync(metaKey)
  if (meta) {
    const count = Number(meta)
    if (Number.isInteger(count) && count > 0 && count < 10_000) {
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
      )
      if (chunks.every((chunk): chunk is string => chunk !== null)) return chunks.join('')
    }
  }
  // Read values written by older builds, before chunking was introduced.
  return SecureStore.getItemAsync(key)
}

async function removeSecureChunks(key: string) {
  const metaKey = chunkMetaKey(key)
  const meta = await SecureStore.getItemAsync(metaKey)
  const count = Number(meta)
  const removals: Promise<void>[] = [SecureStore.deleteItemAsync(metaKey)]
  if (Number.isInteger(count) && count > 0 && count < 10_000) {
    for (let index = 0; index < count; index += 1) {
      removals.push(SecureStore.deleteItemAsync(chunkKey(key, index)))
    }
  }
  await Promise.all(removals)
}

async function writeSecureValue(
  key: string,
  value: string,
  options: SecureStore.SecureStoreOptions,
) {
  if (value.length <= SECURE_CHUNK_SIZE) {
    await removeSecureChunks(key)
    await SecureStore.setItemAsync(key, value, options)
    return
  }

  const chunks: string[] = []
  for (let start = 0; start < value.length; start += SECURE_CHUNK_SIZE) {
    chunks.push(value.slice(start, start + SECURE_CHUNK_SIZE))
  }
  // Do not leave a stale unchunked value that could be read if a later
  // metadata write is interrupted. The metadata record is the commit point.
  await SecureStore.deleteItemAsync(key)
  await removeSecureChunks(key)
  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk, options)),
  )
  await SecureStore.setItemAsync(chunkMetaKey(key), String(chunks.length), options)
}

async function removeSecureValue(key: string) {
  await SecureStore.deleteItemAsync(key)
  await removeSecureChunks(key)
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null
  try {
    window.localStorage.getItem('__planet_kv_probe__')
    return window.localStorage
  } catch {
    return null
  }
}

function webSessionStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null
  try {
    window.sessionStorage.getItem('__planet_session_kv_probe__')
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Remove a legacy persistent web key without touching native SecureStore. */
export function kvRemoveWebPersistent(key: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* A privacy-restricted browser may reject storage access. */
  }
}

/** Remove a legacy browser cache namespace without touching native storage. */
export function kvRemoveWebPersistentPrefix(prefix: string): void {
  const storage = webStorage()
  if (!storage) return
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) storage.removeItem(key)
    }
  } catch {
    /* A privacy-restricted browser may reject storage access. */
  }
}

/** Async key-value store: SecureStore on native, localStorage on web, memory fallback. */
export async function kvGet(key: string): Promise<string | null> {
  const storage = webStorage()
  if (storage) {
    try {
      return storage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  }
  try {
    return await readSecureValue(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  const storage = webStorage()
  if (storage) {
    try {
      storage.setItem(key, value)
      return
    } catch {
      memory.set(key, value)
      return
    }
  }
  try {
    await writeSecureValue(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  } catch {
    memory.set(key, value)
  }
}

export async function kvRemove(key: string): Promise<void> {
  const storage = webStorage()
  if (storage) {
    try {
      storage.removeItem(key)
    } catch {
      /* ignore */
    }
    memory.delete(key)
    return
  }
  try {
    await removeSecureValue(key)
  } catch {
    /* ignore */
  }
  memory.delete(key)
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    await kvRemove(key)
    return null
  }
}

export async function kvSetJSON(key: string, value: unknown): Promise<void> {
  await kvSet(key, JSON.stringify(value))
}

/**
 * Session-scoped JSON storage for short-lived access material such as invite
 * codes. Web values must not survive a browser restart; native still uses the
 * encrypted keychain rather than plain process memory.
 */
export async function kvGetSessionJSON<T>(key: string): Promise<T | null> {
  const storage = webSessionStorage()
  if (storage) {
    try {
      const raw = storage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
  try {
    const raw = await readSecureValue(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function kvSetSessionJSON(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value)
  const storage = webSessionStorage()
  if (storage) {
    storage.setItem(key, raw)
    return
  }
  await writeSecureValue(key, raw, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
}

export async function kvRemoveSession(key: string): Promise<void> {
  const storage = webSessionStorage()
  if (storage) {
    try {
      storage.removeItem(key)
    } catch {
      /* ignore */
    }
    return
  }
  try {
    await removeSecureValue(key)
  } catch {
    /* ignore */
  }
}

/**
 * Durable writes are used for user actions that must survive an app restart.
 * Unlike the best-effort cache writer above, storage failures are surfaced
 * instead of falling back to process memory and pretending the value was saved.
 */
export async function kvSetJSONDurable(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value)
  const storage = webStorage()
  if (storage) {
    storage.setItem(key, raw)
    return
  }
  await writeSecureValue(key, raw, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
}
