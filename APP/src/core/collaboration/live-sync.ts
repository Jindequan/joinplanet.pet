import { Platform } from 'react-native'

export type CareLiveSyncEvent = {
  kind: 'care-request' | 'care-action' | 'timeline' | 'workspace'
  requestId?: string
}

type LiveSyncListener = (event: CareLiveSyncEvent) => void
type LiveSyncEnvelope = CareLiveSyncEvent & { emittedAt: number; nonce: number }

const CHANNEL_NAME = 'planet-care-live-sync-v1'
const STORAGE_KEY = 'planet-care-live-sync-event'
const listeners = new Set<LiveSyncListener>()
let channel: BroadcastChannel | null = null
let initialized = false
let nonce = 0

function isWeb() {
  return Platform.OS === 'web' && typeof window !== 'undefined'
}

function notify(envelope: LiveSyncEnvelope) {
  const event: CareLiveSyncEvent = {
    kind: envelope.kind,
    ...(envelope.requestId ? { requestId: envelope.requestId } : {}),
  }
  listeners.forEach((listener) => listener(event))
}

function initialize() {
  if (!isWeb() || initialized) return
  initialized = true

  if (typeof window.BroadcastChannel === 'function') {
    channel = new window.BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', (event: MessageEvent<LiveSyncEnvelope>) => {
      if (event.data?.emittedAt) notify(event.data)
    })
  }

  // BroadcastChannel is fast, while storage is a compatibility fallback for
  // embedded browsers that expose Web Storage but not BroadcastChannel.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const envelope = JSON.parse(event.newValue) as LiveSyncEnvelope
      if (envelope.emittedAt) notify(envelope)
    } catch {
      // A malformed compatibility event must never affect the app shell.
    }
  })
}

export function subscribeCareLiveSync(listener: LiveSyncListener) {
  if (!isWeb()) return () => undefined
  initialize()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishCareLiveSync(event: CareLiveSyncEvent) {
  if (!isWeb()) return
  initialize()
  const envelope: LiveSyncEnvelope = { ...event, emittedAt: Date.now(), nonce: ++nonce }
  if (channel) {
    channel.postMessage(envelope)
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Browser privacy settings can disable storage; BroadcastChannel still
    // provides the fast path and existing polling remains the fallback.
  }
}
