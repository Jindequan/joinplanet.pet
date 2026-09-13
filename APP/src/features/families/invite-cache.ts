import {
  kvGetSessionJSON,
  kvRemoveSession,
  kvRemoveWebPersistent,
  kvSetSessionJSON,
} from '../../core/storage/kv'

/**
 * 邀请码会话缓存（原生 SecureStore，Web sessionStorage）。
 *
 * 服务端只存哈希、无法回读明文，且 refresh 会吊销全部旧码。若每次打开邀请
 * sheet 都重新生成，管理员刚发出去、家人正要输入的旧码会静默失效。
 * 因此在管理员设备的当前会话中缓存最近一次生成的码：查看不再有副作用，
 * 「重新生成」成为显式操作。服务端有效期 30 天，本地按 29 天保守过期。
 */

type CachedInvite = { code: string; role?: 'caregiver' | 'viewer'; generatedAt: number }

const TTL_MS = 29 * 24 * 60 * 60 * 1000

const keyFor = (familyId: string) => `planet.invite.${familyId}`

export async function getCachedInvite(familyId: string, role: 'caregiver' | 'viewer' = 'caregiver'): Promise<string | null> {
  const key = keyFor(familyId)
  // Older builds used localStorage on Web. Never migrate that access
  // credential into the new session cache; remove the legacy copy instead.
  kvRemoveWebPersistent(key)
  const entry = await kvGetSessionJSON<CachedInvite>(key)
  if (!entry?.code) return null
  if ((entry.role ?? 'caregiver') !== role) return null
  if (Date.now() - entry.generatedAt > TTL_MS) {
    await kvRemoveSession(key)
    return null
  }
  return entry.code
}

export async function setCachedInvite(familyId: string, code: string, role: 'caregiver' | 'viewer' = 'caregiver'): Promise<void> {
  await kvSetSessionJSON(keyFor(familyId), { code, role, generatedAt: Date.now() } satisfies CachedInvite)
}
