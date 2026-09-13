import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { planetApi } from '../api/planet-api'
import { kvGetJSON, kvRemove, kvSetJSON } from '../storage/kv'
import { useSession } from '../providers/session-provider'
import { type Scope } from './scope'

export type { Scope } from './scope'
export { scopeLabel, scopeStorageKey, scopeFilterNeeded } from './scope'

const STORAGE_KEY = 'planet.scope'

/** Remove a deleted account's last scope selection from this device. */
export async function clearStoredScope(userId: string) {
  await kvRemove(`${STORAGE_KEY}.${encodeURIComponent(userId)}`)
}

type ScopeContextValue = {
  scope: Scope
  setScope: (scope: Scope) => void
  resetToDefault: () => Promise<void>
  ready: boolean
}

const ScopeContext = createContext<ScopeContextValue | null>(null)

function isScope(value: unknown): value is Scope {
  if (!value || typeof value !== 'object') return false
  const record = value as { type?: string; id?: string; familyId?: string }
  if (record.type === 'all') return true
  if (record.type === 'family') return typeof record.id === 'string' && record.id.length > 0 && record.familyId === undefined
  return (
    record.type === 'pet' &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    (record.familyId === undefined || typeof record.familyId === 'string')
  )
}

async function scopeFromPreferences(): Promise<Scope> {
  try {
    const result = await planetApi.me.preferences()
    const petId = result.preferences.default_pet_id
    const familyId = result.preferences.default_family_id
    // Keep the default Family edge with the default Pet. A Pet can belong to
    // several Families, so dropping this edge makes Today guess the wrong
    // timezone and collaboration boundary after a cold start.
    if (petId) return { type: 'pet', id: petId, ...(familyId ? { familyId } : {}) }
    if (familyId) return { type: 'family', id: familyId }
  } catch {
    // Not signed in yet, or preferences unavailable — stay on all.
  }
  return { type: 'all' }
}

export function ScopeProvider({ children }: React.PropsWithChildren) {
  const { status, userId } = useSession()
  const [scope, setScopeState] = useState<Scope>({ type: 'all' })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    setReady(false)
    if (status !== 'authenticated' || !userId) {
      setScopeState({ type: 'all' })
      setReady(true)
      return () => {
        mounted = false
      }
    }
    const storageKey = `${STORAGE_KEY}.${encodeURIComponent(userId)}`
    void (async () => {
      const saved = await kvGetJSON<unknown>(storageKey)
      if (!mounted) return
      if (isScope(saved)) {
        setScopeState(saved)
        setReady(true)
        return
      }
      const preferred = await scopeFromPreferences()
      if (!mounted) return
      setScopeState(preferred)
      if (preferred.type !== 'all') void kvSetJSON(storageKey, preferred)
      setReady(true)
    })()
    return () => {
      mounted = false
    }
  }, [status, userId])

  const setScope = useCallback((next: Scope) => {
    setScopeState(next)
    if (status === 'authenticated' && userId) {
      void kvSetJSON(`${STORAGE_KEY}.${encodeURIComponent(userId)}`, next)
    }
  }, [status, userId])

  const resetToDefault = useCallback(async () => {
    if (status !== 'authenticated' || !userId) {
      setScopeState({ type: 'all' })
      return
    }
    const next = await scopeFromPreferences()
    setScopeState(next)
    await kvSetJSON(`${STORAGE_KEY}.${encodeURIComponent(userId)}`, next)
  }, [status, userId])

  const value = useMemo(
    () => ({ scope, setScope, resetToDefault, ready }),
    [ready, resetToDefault, scope, setScope],
  )

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope(): ScopeContextValue {
  const context = useContext(ScopeContext)
  if (!context) throw new Error('useScope must be used inside ScopeProvider')
  return context
}
